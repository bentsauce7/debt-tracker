import { notFound, redirect } from 'next/navigation';
import { and, desc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/db';
import { accounts, liabilities, aprs, manualOverrides, plaidItems, promoPurchases, statements } from '@/db/schema';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { formatCurrency, formatPercent, formatDate, calcUtilization } from '@/lib/utils';
import { ArrowLeft } from 'lucide-react';
import { StatementHistory } from './statement-history';
import { PromoPurchaseSuggestions } from './promo-purchase-suggestions';
import { UploadStatementButton } from '@/components/upload-statement-button';

async function getAccount(accountId: string, userId: string) {
  const [account] = await db
    .select()
    .from(accounts)
    .leftJoin(plaidItems, eq(plaidItems.id, accounts.itemId))
    .where(and(eq(accounts.accountId, accountId), eq(accounts.userId, userId)))
    .limit(1);

  if (!account) return null;

  const [liability, accountAprs, override, purchases, accountStatements] = await Promise.all([
    db.select().from(liabilities).where(eq(liabilities.accountId, accountId)).limit(1),
    db.select().from(aprs).where(eq(aprs.accountId, accountId)),
    db.select().from(manualOverrides).where(eq(manualOverrides.accountId, accountId)).limit(1),
    db.select().from(promoPurchases).where(eq(promoPurchases.accountId, accountId)),
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
  if (!userId) redirect('/sign-in');
  const data = await getAccount(id, userId);

  if (!data) notFound();

  const { account, institution, liability, aprs: accountAprs, override, purchases, accountStatements } = data;
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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Statement History</CardTitle>
          <UploadStatementButton accountId={account.accountId} />
        </CardHeader>
        <CardContent>
          {accountStatements.length > 0 ? (
            <StatementHistory statements={accountStatements} />
          ) : (
            <p className="text-sm text-muted-foreground">No statements yet. Upload a PDF to get started.</p>
          )}
        </CardContent>
      </Card>

      <PromoPurchaseSuggestions
        accountId={account.accountId}
        statements={accountStatements}
        existingPurchases={purchases}
      />

      {purchases.length > 0 && (() => {
        const today = new Date().toISOString().slice(0, 10);
        const active = purchases.filter((p) => p.promoEndDate >= today);
        const totalActiveBalance = active.reduce((sum, p) => sum + parseFloat(p.purchaseAmount), 0);
        const earliestEnd = active.length
          ? active.reduce((min, p) => (p.promoEndDate < min ? p.promoEndDate : min), active[0].promoEndDate)
          : null;
        return (
          <Card>
            <CardHeader>
              <CardTitle>Tracked Promotional Purchases</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-3">
                {purchases.map((p) => {
                  const expired = p.promoEndDate < today;
                  const daysLeft = Math.ceil(
                    (new Date(p.promoEndDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
                  );
                  const feeLabel = formatStoredFee(p);
                  return (
                    <li key={p.id} className="flex items-start justify-between gap-4 text-sm">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{p.description ?? 'Promotional purchase'}</p>
                          {p.isDeferredInterest && <Badge variant="secondary">Deferred interest</Badge>}
                        </div>
                        <p className="text-muted-foreground">
                          {formatCurrency(p.purchaseAmount)}
                          {p.purchaseDate ? ` · purchased ${formatDate(p.purchaseDate)}` : ''}
                          {feeLabel ? ` · ${feeLabel}` : ''}
                          {p.accruedDeferredInterest
                            ? ` · ${formatCurrency(p.accruedDeferredInterest)} accrued at risk`
                            : ''}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={expired ? 'text-destructive font-medium' : 'font-medium'}>
                          {expired ? 'Expired' : `${daysLeft} day${daysLeft !== 1 ? 's' : ''} left`}
                        </p>
                        <p className="text-xs text-muted-foreground">expires {formatDate(p.promoEndDate)}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {active.length > 1 && earliestEnd && (
                <div className="grid gap-3 sm:grid-cols-2 pt-3 border-t text-sm">
                  <Row
                    label="Total active promo balance"
                    value={formatCurrency(totalActiveBalance.toFixed(2))}
                  />
                  <Row label="Earliest expiration" value={formatDate(earliestEnd)} />
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

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

const FEE_FREQUENCY_LABELS: Record<string, string> = {
  monthly: '/mo',
  quarterly: '/qtr',
  annual: '/yr',
  one_time: ' one-time',
};

function formatStoredFee(p: {
  feeAmount: string | null;
  feeType: string | null;
  feeFrequency: string | null;
}): string | null {
  if (!p.feeAmount || !p.feeType) return null;
  const amount = parseFloat(p.feeAmount);
  if (!Number.isFinite(amount)) return null;
  const value =
    p.feeType === 'percentage'
      ? `${amount}% fee`
      : `$${amount.toFixed(2)} fee`;
  const cadence = p.feeFrequency ? (FEE_FREQUENCY_LABELS[p.feeFrequency] ?? '') : '';
  return `${value}${cadence}`;
}
