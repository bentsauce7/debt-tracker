import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/db';
import { plaidItems, accounts, aprs, statements } from '@/db/schema';
import { Products } from 'plaid';
import { plaidClient } from '@/lib/plaid';
import { decrypt } from '@/lib/crypto';
import { extractStatement } from '@/lib/extract-statement';

export const maxDuration = 300;

const MAX_STATEMENTS_PER_RUN = 6;

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const items = await db
    .select()
    .from(plaidItems)
    .where(eq(plaidItems.userId, userId));

  const results: { institution: string; statementsProcessed: number; errors: string[] }[] = [];
  let processedThisRun = 0;
  let hitCap = false;

  outer: for (const item of items) {
    const label = item.institutionName ?? item.itemId;
    const itemErrors: string[] = [];
    let statementsProcessed = 0;

    try {
      const accessToken = decrypt(item.accessToken);

      // Skip items that haven't been granted Statements consent.
      const itemResp = await plaidClient.itemGet({ access_token: accessToken });
      const consented = itemResp.data.item.consented_products ?? [];
      if (!consented.includes(Products.Statements)) continue;

      // Get all credit accounts for this item
      const itemAccounts = await db
        .select({ accountId: accounts.accountId })
        .from(accounts)
        .where(eq(accounts.itemId, item.id));

      if (itemAccounts.length === 0) continue;

      const accountIds = itemAccounts.map((a) => a.accountId);

      // List available statements
      const statementsResp = await plaidClient.statementsList({ access_token: accessToken });
      const plaidAccounts = statementsResp.data.accounts;

      for (const plaidAccount of plaidAccounts) {
        if (!accountIds.includes(plaidAccount.account_id)) continue;
        const accountId = plaidAccount.account_id;

        // Find statements not yet processed
        const existingIds = await db
          .select({ plaidStatementId: statements.plaidStatementId })
          .from(statements)
          .where(eq(statements.accountId, accountId));

        const existingSet = new Set(existingIds.map((s) => s.plaidStatementId));

        const newStatements = plaidAccount.statements.filter(
          (s) => !existingSet.has(s.statement_id),
        );

        for (const stmt of newStatements) {
          if (processedThisRun >= MAX_STATEMENTS_PER_RUN) {
            hitCap = true;
            break;
          }
          try {
            // Download the PDF
            const dlResp = await plaidClient.statementsDownload(
              { access_token: accessToken, statement_id: stmt.statement_id },
              { responseType: 'arraybuffer' },
            );

            const pdfBase64 = Buffer.from(dlResp.data as ArrayBuffer).toString('base64');

            // Extract data with Claude
            const extraction = await extractStatement(pdfBase64);

            // Store statement record
            const statementDate = extraction.statementDate
              ?? (stmt.month ? `${stmt.year}-${String(stmt.month).padStart(2, '0')}-01` : `${stmt.year}-01-01`);
            await db.insert(statements).values({
              accountId,
              plaidStatementId: stmt.statement_id,
              statementDate,
              closingBalance: extraction.closingBalance?.toString() ?? undefined,
              minimumPayment: extraction.minimumPayment?.toString() ?? undefined,
              paymentDueDate: extraction.paymentDueDate ?? undefined,
              extractedAprs: extraction.aprs,
              extractedPromoPurchases: extraction.promoPurchases,
            });

            // Update aprs table from the most recent statement
            if (extraction.aprs.length > 0) {
              const aprTypeMap: Record<string, string> = {
                purchase: 'purchase_apr',
                balance_transfer: 'balance_transfer_apr',
                cash_advance: 'cash_apr',
                promotional: 'special',
              };

              await db.delete(aprs).where(eq(aprs.accountId, accountId));
              await db.insert(aprs).values(
                extraction.aprs.map((apr) => ({
                  accountId,
                  aprType: aprTypeMap[apr.type] ?? apr.type,
                  aprPercentage: apr.rate.toString(),
                  balanceSubjectToApr: apr.balance?.toString() ?? undefined,
                })),
              );
            }

            statementsProcessed++;
            processedThisRun++;
          } catch (err) {
            itemErrors.push(`${stmt.statement_id}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
        if (hitCap) break;
      }
    } catch (err) {
      const plaidData = (err as { response?: { data?: { error_code?: string; error_message?: string } } })?.response?.data;
      if (plaidData?.error_code === 'ADDITIONAL_CONSENT_REQUIRED') continue;
      const msg = plaidData
        ? `${plaidData.error_code}: ${plaidData.error_message}`
        : (err instanceof Error ? err.message : String(err));
      itemErrors.push(msg);
    }

    results.push({ institution: label, statementsProcessed, errors: itemErrors });
    if (hitCap) break outer;
  }

  return NextResponse.json({ results, done: !hitCap });
}
