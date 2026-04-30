import { notFound } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/db';
import { accounts, liabilities, aprs, manualOverrides, plaidItems, mxMembers, promoPurchases, transactions, statements } from '@/db/schema';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { formatCurrency, formatPercent, formatDate, calcUtilization } from '@/lib/utils';
import { ArrowLeft } from 'lucide-react';
import { OverrideForm } from './override-form';
import { PromoPurchasesSection } from './promo-purchases-section';
import { StatementHistory } from './statement-history';
import { PromoPurchaseSuggestions } from './promo-purchase-suggestions';

async function getAccount(accountId: string, userId: string) {
  const [account] = await db
    .select()
    .from(accounts)
    .leftJoin(plaidItems, eq(plaidItems.id, accounts.itemId))
    .leftJoin(mxMembers, eq(mxMembers.id, accounts.mxMemberId))
    .where(eq(accounts.accountId, accountId))
    .limit(1);

  if (!account) return null;

  // Verify the account belongs to the requesting user
  const ownerUserId = account.plaid_items?.userId ?? account.mx_members?.userId;
  if (ownerUserId !== userId) return null;

  const [liability, accountAprs, override, purchases, accountTransactions, accountStatements] = await Promise.all([
    db.select().from(liabilities).where(eq(liabilities.accountId, accountId)).limit(1),
    db.select().from(aprs).where(eq(aprs.accountId, accountId)),
    db.select().from(manualOverrides).where(eq(manualOverrides.accountId, accountId)).limit(1),
    db.select().from(promoPurchases).where(eq(promoPurchases.accountId, accountId)),
    db.select().from(transactions)
      .where(eq(transactions.accountId, accountId))
      .orderBy(desc(transactions.date))
      .limit(100),
    db.select().from(statements)
      .where(eq(statements.accountId, accountId))
      .orderBy(desc(statements.statementDate))
      .limit(24),
  ]);

  return {
    account: account.accounts,
    institution: account.plaid_items,
    liability: liability[0] ?? null,
    aprs: accountAprs,
    override: override[0] ?? null,
    purchases,
    accountTransactions,
    accountStatements,
  };
}

const APR_TYPE_LABELS: Record<string, string> = {
  purchase_apr: 'Purchase',
  balance_transfer_apr: 'Balance Transfer',
  cash_apr: 'Cash Advance',
  special: 'Special / Promo',
};

export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await auth();
  const data = await getAccount(id, userId!);

  if (!data) notFound();

  const { account, institution, liability, aprs: accountAprs, override, purchases, accountTransactions, accountStatements } = data;
  const util = calcUtilization(account.currentBalance, account.creditLimit);
  const specialApr = accountAprs.find((a) => a.aprType === 'special');

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2 gap-1.5 text-muted-foreground">
          <Link href="/accounts">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to accounts
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">
          {institution?.institutionName ? `${institution.institutionName} — ` : ''}
          {account.name}
        </h1>
        {account.mask && (
          <p className="text-muted-foreground capitalize">
            {account.subtype ?? account.type} ···{account.mask}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Current Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(account.currentBalance)}</div>
            {account.creditLimit && (
              <p className="text-xs text-muted-foreground mt-1">
                of {formatCurrency(account.creditLimit)} limit
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Utilization</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${util !== null && util > 90 ? 'text-destructive' : ''}`}>
              {util !== null ? formatPercent(util) : '—'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {util !== null && util > 90 ? 'High utilization' : 'of credit limit'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Min Payment Due</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {liability ? formatCurrency(liability.minimumPaymentAmount) : '—'}
            </div>
            <p className={`text-xs mt-1 ${account.isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
              due {liability?.nextPaymentDueDate ? formatDate(liability.nextPaymentDueDate) : '—'}
            </p>
          </CardContent>
        </Card>
      </div>

      {liability && (
        <Card>
          <CardHeader>
            <CardTitle>Statement Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
            <Row label="Last Statement Balance" value={formatCurrency(liability.lastStatementBalance)} />
            <Row label="Last Statement Date" value={formatDate(liability.lastStatementIssueDate)} />
            <Row label="Last Payment" value={formatCurrency(liability.lastPaymentAmount)} />
            <Row label="Last Payment Date" value={formatDate(liability.lastPaymentDate)} />
          </CardContent>
        </Card>
      )}

      {accountAprs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>APR Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {accountAprs.map((apr) => (
              <div key={apr.id}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{APR_TYPE_LABELS[apr.aprType] ?? apr.aprType}</span>
                    {apr.aprType === 'special' && <Badge variant="secondary">Promo</Badge>}
                  </div>
                  <span className="font-mono font-semibold">{formatPercent(apr.aprPercentage)}</span>
                </div>
                {apr.balanceSubjectToApr && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatCurrency(apr.balanceSubjectToApr)} subject to this rate
                  </p>
                )}
                <Separator className="mt-3" />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {(specialApr || override?.promoExpirationDate) && (
        <Card>
          <CardHeader>
            <CardTitle>Promotional Rate</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
            {(() => {
              const promoAprPct = override?.promoAprPercentage ?? specialApr?.aprPercentage;
              const promoBalStr = override?.promoBalance ?? specialApr?.balanceSubjectToApr;
              const promoBalAmt = promoBalStr ? parseFloat(promoBalStr) : 0;
              const promoBalSource = override?.promoBalance ? null : specialApr?.balanceSubjectToApr ? 'Plaid' : null;
              const expiryDate = override?.promoExpirationDate ?? null;
              let daysLeft: number | null = null;
              let requiredMonthly: number | null = null;
              if (expiryDate) {
                const today = new Date();
                daysLeft = Math.ceil((new Date(expiryDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                const monthsLeft = Math.max(1, Math.round(daysLeft / 30.44));
                requiredMonthly = promoBalAmt > 0 ? promoBalAmt / monthsLeft : null;
              }
              return (
                <>
                  <Row
                    label="Promo APR"
                    value={promoAprPct ? formatPercent(parseFloat(promoAprPct)) : '—'}
                  />
                  {expiryDate && (
                    <Row label="Expires" value={formatDate(expiryDate)} />
                  )}
                  {override && (
                    <Row
                      label="Type"
                      value={override.isDeferredInterest ? 'Deferred interest' : 'Standard promo'}
                    />
                  )}
                  {daysLeft !== null && (
                    daysLeft > 0 ? (
                      <Row label="Time remaining" value={`${daysLeft} day${daysLeft !== 1 ? 's' : ''}`} />
                    ) : (
                      <Row label="Status" value="Expired" />
                    )
                  )}
                  {promoBalStr && (
                    <Row
                      label={`Promo balance${promoBalSource ? ` (from ${promoBalSource})` : ''}`}
                      value={formatCurrency(promoBalStr)}
                    />
                  )}
                  {override?.accruedDeferredInterest && (
                    <Row label="Deferred interest at risk" value={formatCurrency(override.accruedDeferredInterest)} />
                  )}
                  {requiredMonthly && (
                    <Row
                      label="Required monthly payment"
                      value={`${formatCurrency(requiredMonthly)}/mo to clear by deadline`}
                    />
                  )}
                </>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {accountStatements.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Statement History</CardTitle>
          </CardHeader>
          <CardContent>
            <StatementHistory statements={accountStatements} />
          </CardContent>
        </Card>
      )}

      <PromoPurchaseSuggestions
        accountId={account.accountId}
        statements={accountStatements}
        existingPurchases={purchases}
      />

      <Card>
        <CardHeader>
          <CardTitle>Promotional Purchases</CardTitle>
        </CardHeader>
        <CardContent>
          <PromoPurchasesSection accountId={account.accountId} initial={purchases} availableTransactions={accountTransactions} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Manual Overrides</CardTitle>
        </CardHeader>
        <CardContent>
          <OverrideForm accountId={account.accountId} initial={override} />
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Last synced: {account.lastSyncedAt ? formatDate(account.lastSyncedAt) : 'never'}
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
