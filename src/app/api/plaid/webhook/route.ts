import { NextRequest, NextResponse } from 'next/server';
import { eq, sql, inArray } from 'drizzle-orm';
import crypto from 'crypto';
import * as jose from 'jose';
import { db } from '@/db';
import { plaidItems, accounts, liabilities, aprs, transactions } from '@/db/schema';
import { plaidClient } from '@/lib/plaid';
import { decrypt } from '@/lib/crypto';

async function verifyWebhook(token: string, rawBody: string): Promise<boolean> {
  try {
    const { kid } = jose.decodeProtectedHeader(token);
    if (!kid) return false;

    const keyResp = await plaidClient.webhookVerificationKeyGet({ key_id: kid as string });
    const publicKey = await jose.importJWK(keyResp.data.key as jose.JWK);

    const { payload } = await jose.jwtVerify(token, publicKey, { algorithms: ['ES256'] });
    const bodyHash = crypto.createHash('sha256').update(rawBody).digest('hex');
    return (payload as { request_body_sha256?: string }).request_body_sha256 === bodyHash;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const verificationToken = request.headers.get('Plaid-Verification');

  if (!verificationToken || !(await verifyWebhook(verificationToken, rawBody))) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const body = JSON.parse(rawBody) as {
    webhook_type: string;
    webhook_code: string;
    item_id: string;
    error?: { error_code?: string };
  };

  const { webhook_type, webhook_code, item_id } = body;

  const [item] = await db.select().from(plaidItems).where(eq(plaidItems.itemId, item_id)).limit(1);
  if (!item) return NextResponse.json({ ok: true });

  const accessToken = decrypt(item.accessToken);

  if (webhook_type === 'TRANSACTIONS' && webhook_code === 'SYNC_UPDATES_AVAILABLE') {
    try {
      let cursor = item.cursor ?? undefined;
      let hasMore = true;

      while (hasMore) {
        const { data } = await plaidClient.transactionsSync({ access_token: accessToken, cursor });
        const { added, modified, removed, next_cursor, has_more } = data;

        const upsertRows = [...added, ...modified];
        if (upsertRows.length > 0) {
          await db.insert(transactions).values(
            upsertRows.map((tx) => ({
              accountId: tx.account_id,
              transactionId: tx.transaction_id,
              name: tx.name,
              merchantName: tx.merchant_name ?? undefined,
              amount: tx.amount.toString(),
              date: tx.date,
              pending: tx.pending,
            })),
          ).onConflictDoUpdate({
            target: transactions.transactionId,
            set: {
              name: sql`excluded.name`,
              merchantName: sql`excluded.merchant_name`,
              amount: sql`excluded.amount`,
              date: sql`excluded.date`,
              pending: sql`excluded.pending`,
            },
          });
        }

        if (removed.length > 0) {
          await db.delete(transactions).where(
            inArray(transactions.transactionId, removed.map((r) => r.transaction_id)),
          );
        }

        cursor = next_cursor;
        hasMore = has_more;
      }

      await db.update(plaidItems).set({ cursor, updatedAt: new Date() }).where(eq(plaidItems.id, item.id));
    } catch (err) {
      console.error('plaid webhook TRANSACTIONS sync failed', { itemId: item_id, err });
    }
  }

  if (webhook_type === 'LIABILITIES' && webhook_code === 'DEFAULT_UPDATE') {
    try {
      const [accountsResp, liabilitiesResp] = await Promise.all([
        plaidClient.accountsGet({ access_token: accessToken }),
        plaidClient.liabilitiesGet({ access_token: accessToken }),
      ]);

      if (accountsResp.data.accounts.length > 0) {
        await db.insert(accounts).values(
          accountsResp.data.accounts.map((acct) => ({
            itemId: item.id,
            accountId: acct.account_id,
            name: acct.name,
            mask: acct.mask ?? undefined,
            officialName: acct.official_name ?? undefined,
            type: acct.type,
            subtype: acct.subtype ?? undefined,
            currentBalance: acct.balances.current?.toString() ?? undefined,
            availableBalance: acct.balances.available?.toString() ?? undefined,
            creditLimit: acct.balances.limit?.toString() ?? undefined,
            lastSyncedAt: new Date(),
          })),
        ).onConflictDoUpdate({
          target: accounts.accountId,
          set: {
            currentBalance: sql`excluded.current_balance`,
            availableBalance: sql`excluded.available_balance`,
            creditLimit: sql`excluded.credit_limit`,
            lastSyncedAt: sql`excluded.last_synced_at`,
          },
        });
      }

      for (const credit of liabilitiesResp.data.liabilities.credit ?? []) {
        if (!credit.account_id) continue;
        const accountId = credit.account_id;

        const liabilityValues = {
          accountId,
          lastStatementBalance: credit.last_statement_balance?.toString() ?? undefined,
          lastStatementIssueDate: credit.last_statement_issue_date ?? undefined,
          minimumPaymentAmount: credit.minimum_payment_amount?.toString() ?? undefined,
          nextPaymentDueDate: credit.next_payment_due_date ?? undefined,
          lastPaymentAmount: credit.last_payment_amount?.toString() ?? undefined,
          lastPaymentDate: credit.last_payment_date ?? undefined,
        };

        const liabilityUpsert = db.insert(liabilities).values(liabilityValues).onConflictDoUpdate({
          target: liabilities.accountId,
          set: liabilityValues,
        });
        const overdueUpdate = db.update(accounts)
          .set({ isOverdue: credit.is_overdue ?? false })
          .where(eq(accounts.accountId, accountId));
        const aprDelete = db.delete(aprs).where(eq(aprs.accountId, accountId));

        if (credit.aprs && credit.aprs.length > 0) {
          const aprInsert = db.insert(aprs).values(
            credit.aprs.map((apr) => ({
              accountId,
              aprPercentage: apr.apr_percentage?.toString() ?? undefined,
              aprType: apr.apr_type,
              balanceSubjectToApr: apr.balance_subject_to_apr?.toString() ?? undefined,
              interestChargeAmount: apr.interest_charge_amount?.toString() ?? undefined,
            })),
          );
          await db.batch([liabilityUpsert, overdueUpdate, aprDelete, aprInsert]);
        } else {
          await db.batch([liabilityUpsert, overdueUpdate, aprDelete]);
        }
      }
    } catch (err) {
      console.error('plaid webhook LIABILITIES update failed', { itemId: item_id, err });
    }
  }

  if (webhook_type === 'ITEM' && webhook_code === 'ERROR' && body.error?.error_code === 'ITEM_LOGIN_REQUIRED') {
    await db.update(plaidItems)
      .set({ needsReauth: true, updatedAt: new Date() })
      .where(eq(plaidItems.id, item.id));
  }

  return NextResponse.json({ ok: true });
}
