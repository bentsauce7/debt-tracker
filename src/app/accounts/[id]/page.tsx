import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import Link from 'next/link';
import { db } from '@/db';
import { accounts, liabilities, aprs, manualOverrides, plaidItems } from '@/db/schema';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { formatCurrency, formatPercent, formatDate, calcUtilization } from '@/lib/utils';
import { OverrideForm } from './override-form';
import { ArrowLeft } from 'lucide-react';

async function getAccount(accountId: string) {
  const [account] = await db
    .select()
    .from(accounts)
    .leftJoin(plaidItems, eq(plaidItems.id, accounts.itemId))
    .where(eq(accounts.accountId, accountId))
    .limit(1);

  if (!account) return null;

  const [liability, accountAprs, override] = await Promise.all([
    db.select().from(liabilities).where(eq(liabilities.accountId, accountId)).limit(1),
    db.select().from(aprs).where(eq(aprs.accountId, accountId)),
    db.select().from(manualOverrides).where(eq(manualOverrides.accountId, accountId)).limit(1),
  ]);

  return {
    account: account.accounts,
    institution: account.plaid_items,
    liability: liability[0] ?? null,
    aprs: accountAprs,
    override: override[0] ?? null,
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
  const data = await getAccount(id);

  if (!data) notFound();

  const { account, institution, liability, aprs: accountAprs, override } = data;
  const util = calcUtilization(account.currentBalance, account.creditLimit);

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

      {override && override.promoExpirationDate && (
        <Card>
          <CardHeader>
            <CardTitle>Promotional Rate</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
            <Row
              label="Promo APR"
              value={override.promoAprPercentage ? formatPercent(parseFloat(override.promoAprPercentage)) : '—'}
            />
            <Row label="Expires" value={formatDate(override.promoExpirationDate)} />
            <Row
              label="Type"
              value={override.isDeferredInterest ? 'Deferred interest — unpaid balance accrues hidden interest' : 'Standard promo — no interest if paid by expiry'}
            />
            {(() => {
              const today = new Date();
              const expiry = new Date(override.promoExpirationDate!);
              const daysLeft = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              return daysLeft > 0 ? (
                <Row label="Time remaining" value={`${daysLeft} day${daysLeft !== 1 ? 's' : ''}`} />
              ) : (
                <Row label="Status" value="Expired" />
              );
            })()}
          </CardContent>
        </Card>
      )}

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
