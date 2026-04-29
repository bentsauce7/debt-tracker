import { NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/db';
import { plaidItems, accounts, liabilities, aprs, transactions, syncLog } from '@/db/schema';
import { plaidClient } from '@/lib/plaid';
import { decrypt } from '@/lib/crypto';

function isPlaidLoginError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'response' in err &&
    typeof (err as { response?: { data?: { error_code?: string } } }).response?.data?.error_code === 'string' &&
    (err as { response: { data: { error_code: string } } }).response.data.error_code === 'ITEM_LOGIN_REQUIRED'
  );
}

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [logRow] = await db
    .insert(syncLog)
    .values({ userId, status: 'running' })
    .returning({ id: syncLog.id });

  const logId = logRow.id;
  const errors: string[] = [];
  let itemsSynced = 0;
  let accountsUpdated = 0;

  try {
    const items = await db
      .select()
      .from(plaidItems)
      .where(and(eq(plaidItems.userId, userId), eq(plaidItems.needsReauth, false)));

    for (const item of items) {
      const label = item.institutionName ?? item.itemId;
      try {
        const accessToken = decrypt(item.accessToken);

        const [accountsResp, liabilitiesResp] = await Promise.all([
          plaidClient.accountsGet({ access_token: accessToken }),
          plaidClient.liabilitiesGet({ access_token: accessToken }),
        ]);

        const plaidAccounts = accountsResp.data.accounts;
        const creditLiabilities = liabilitiesResp.data.liabilities.credit ?? [];

        for (const acct of plaidAccounts) {
          await db
            .insert(accounts)
            .values({
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
            })
            .onConflictDoUpdate({
              target: accounts.accountId,
              set: {
                name: acct.name,
                mask: acct.mask ?? undefined,
                officialName: acct.official_name ?? undefined,
                type: acct.type,
                subtype: acct.subtype ?? undefined,
                currentBalance: acct.balances.current?.toString() ?? undefined,
                availableBalance: acct.balances.available?.toString() ?? undefined,
                creditLimit: acct.balances.limit?.toString() ?? undefined,
                lastSyncedAt: new Date(),
              },
            });
          accountsUpdated++;
        }

        for (const credit of creditLiabilities) {
          if (!credit.account_id) continue;
          const accountId = credit.account_id;
          await db
            .insert(liabilities)
            .values({
              accountId,
              lastStatementBalance: credit.last_statement_balance?.toString() ?? undefined,
              lastStatementIssueDate: credit.last_statement_issue_date ?? undefined,
              minimumPaymentAmount: credit.minimum_payment_amount?.toString() ?? undefined,
              nextPaymentDueDate: credit.next_payment_due_date ?? undefined,
              lastPaymentAmount: credit.last_payment_amount?.toString() ?? undefined,
              lastPaymentDate: credit.last_payment_date ?? undefined,
            })
            .onConflictDoUpdate({
              target: liabilities.accountId,
              set: {
                lastStatementBalance: credit.last_statement_balance?.toString() ?? undefined,
                lastStatementIssueDate: credit.last_statement_issue_date ?? undefined,
                minimumPaymentAmount: credit.minimum_payment_amount?.toString() ?? undefined,
                nextPaymentDueDate: credit.next_payment_due_date ?? undefined,
                lastPaymentAmount: credit.last_payment_amount?.toString() ?? undefined,
                lastPaymentDate: credit.last_payment_date ?? undefined,
              },
            });

          await db
            .update(accounts)
            .set({ isOverdue: credit.is_overdue ?? false })
            .where(eq(accounts.accountId, accountId));

          await db.delete(aprs).where(eq(aprs.accountId, accountId));

          if (credit.aprs && credit.aprs.length > 0) {
            await db.insert(aprs).values(
              credit.aprs.map((apr) => ({
                accountId: accountId,
                aprPercentage: apr.apr_percentage?.toString() ?? undefined,
                aprType: apr.apr_type,
                balanceSubjectToApr: apr.balance_subject_to_apr?.toString() ?? undefined,
                interestChargeAmount: apr.interest_charge_amount?.toString() ?? undefined,
              })),
            );
          }
        }

        // Sync transactions (requires transactions product — skip gracefully if not enabled)
        try {
          let cursor = item.cursor ?? undefined;
          let hasMore = true;

          while (hasMore) {
            const txResp = await plaidClient.transactionsSync({
              access_token: accessToken,
              cursor,
            });
            const { added, modified, removed, next_cursor, has_more } = txResp.data;

            if (added.length > 0) {
              await db.insert(transactions).values(
                added.map((tx) => ({
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

            if (modified.length > 0) {
              for (const tx of modified) {
                await db.update(transactions).set({
                  name: tx.name,
                  merchantName: tx.merchant_name ?? undefined,
                  amount: tx.amount.toString(),
                  date: tx.date,
                  pending: tx.pending,
                }).where(eq(transactions.transactionId, tx.transaction_id));
              }
            }

            if (removed.length > 0) {
              for (const tx of removed) {
                await db.delete(transactions).where(eq(transactions.transactionId, tx.transaction_id));
              }
            }

            cursor = next_cursor;
            hasMore = has_more;
          }

          await db.update(plaidItems).set({ cursor, updatedAt: new Date() }).where(eq(plaidItems.id, item.id));
        } catch {
          // transactions product not enabled for this item — skip silently
        }

        itemsSynced++;
      } catch (err: unknown) {
        if (isPlaidLoginError(err)) {
          await db
            .update(plaidItems)
            .set({ needsReauth: true, updatedAt: new Date() })
            .where(eq(plaidItems.id, item.id));
          errors.push(`${label}: needs reauthorization`);
        } else {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`${label}: ${msg}`);
        }
      }
    }
  } finally {
    await db
      .update(syncLog)
      .set({
        completedAt: new Date(),
        itemsSynced,
        accountsUpdated,
        errors,
        status: itemsSynced === 0 && errors.length > 0 ? 'failed' : 'completed',
      })
      .where(eq(syncLog.id, logId));
  }

  return NextResponse.json({ success: true, itemsSynced, accountsUpdated, errors });
}
