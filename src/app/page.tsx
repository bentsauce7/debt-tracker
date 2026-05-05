import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, eq, desc } from 'drizzle-orm';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/db';
import { accounts, liabilities, aprs, syncLog } from '@/db/schema';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatPercent, formatDate } from '@/lib/utils';
import { AlertTriangle, RefreshCw } from 'lucide-react';

async function getDashboardMetrics(userId: string) {
  const [creditRows, purchaseAprs, lastSync] = await Promise.all([
    db
      .select({
        accountId: accounts.accountId,
        currentBalance: accounts.currentBalance,
        creditLimit: accounts.creditLimit,
        isOverdue: accounts.isOverdue,
        minimumPaymentAmount: liabilities.minimumPaymentAmount,
        nextPaymentDueDate: liabilities.nextPaymentDueDate,
      })
      .from(accounts)
      .leftJoin(liabilities, eq(liabilities.accountId, accounts.accountId))
      .where(and(eq(accounts.type, 'credit'), eq(accounts.userId, userId))),

    db
      .select({ accountId: aprs.accountId, aprPercentage: aprs.aprPercentage })
      .from(aprs)
      .innerJoin(accounts, eq(accounts.accountId, aprs.accountId))
      .where(and(eq(aprs.aprType, 'purchase_apr'), eq(accounts.userId, userId))),

    db
      .select({ completedAt: syncLog.completedAt })
      .from(syncLog)
      .orderBy(desc(syncLog.startedAt))
      .limit(1),
  ]);

  const aprMap = new Map(
    purchaseAprs.map((a) => [a.accountId, parseFloat(a.aprPercentage ?? '0')]),
  );

  let totalDebt = 0;
  let weightedAprSum = 0;
  let totalMinPayments = 0;
  let pastDueCount = 0;
  let overLimitCount = 0;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  for (const row of creditRows) {
    const balance = parseFloat(row.currentBalance ?? '0');
    const limit = parseFloat(row.creditLimit ?? '0');
    const minPayment = parseFloat(row.minimumPaymentAmount ?? '0');
    const apr = aprMap.get(row.accountId) ?? 0;

    totalDebt += balance;
    weightedAprSum += balance * apr;

    if (row.nextPaymentDueDate) {
      const due = new Date(row.nextPaymentDueDate);
      if (due >= monthStart && due <= monthEnd) totalMinPayments += minPayment;
    }

    if (row.isOverdue) pastDueCount++;
    if (limit > 0 && balance > limit) overLimitCount++;
  }

  return {
    totalDebt,
    weightedAvgApr: totalDebt > 0 ? weightedAprSum / totalDebt : 0,
    totalMinPayments,
    pastDueCount,
    overLimitCount,
    accountCount: creditRows.length,
    lastSyncAt: lastSync[0]?.completedAt ?? null,
  };
}

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');
  const data = await getDashboardMetrics(userId);
  const hasFlags = data.pastDueCount > 0 || data.overLimitCount > 0;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          {data.lastSyncAt && (
            <p className="text-sm text-muted-foreground mt-1">
              Last synced {formatDate(data.lastSyncAt)}
            </p>
          )}
        </div>
        <Button asChild variant="outline" size="sm" className="gap-2">
          <Link href="/sync">
            <RefreshCw className="h-3.5 w-3.5" />
            Sync
          </Link>
        </Button>
      </div>

      {hasFlags && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="font-medium text-destructive">Action required</p>
            <ul className="text-sm text-destructive/80 space-y-0.5">
              {data.pastDueCount > 0 && (
                <li>{data.pastDueCount} account{data.pastDueCount !== 1 ? 's' : ''} past due</li>
              )}
              {data.overLimitCount > 0 && (
                <li>{data.overLimitCount} account{data.overLimitCount !== 1 ? 's' : ''} over limit</li>
              )}
            </ul>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Revolving Debt"
          value={formatCurrency(data.totalDebt)}
          sub={`${data.accountCount} credit account${data.accountCount !== 1 ? 's' : ''}`}
        />
        <MetricCard
          title="Weighted Avg APR"
          value={formatPercent(data.weightedAvgApr)}
          sub="across all balances"
        />
        <MetricCard
          title="Min Payments Due"
          value={formatCurrency(data.totalMinPayments)}
          sub="this calendar month"
        />
        <MetricCard
          title="Red Flags"
          value={String(data.pastDueCount + data.overLimitCount)}
          sub={hasFlags ? `${data.pastDueCount} past due · ${data.overLimitCount} over limit` : 'All accounts OK'}
          highlight={hasFlags}
        />
      </div>

      {data.accountCount === 0 && (
        <div className="rounded-lg border border-dashed p-12 text-center space-y-3">
          <p className="text-muted-foreground">No accounts connected yet.</p>
          <Button asChild>
            <Link href="/connect">Connect your first institution</Link>
          </Button>
        </div>
      )}

      {data.accountCount > 0 && (
        <div className="flex justify-end">
          <Button asChild variant="outline">
            <Link href="/accounts">View all accounts →</Link>
          </Button>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  title,
  value,
  sub,
  highlight,
}: {
  title: string;
  value: string;
  sub: string;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? 'border-destructive/50' : ''}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${highlight ? 'text-destructive' : ''}`}>{value}</div>
        <p className="text-xs text-muted-foreground mt-1">{sub}</p>
      </CardContent>
    </Card>
  );
}
