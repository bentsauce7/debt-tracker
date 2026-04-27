import { NextResponse } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/db';
import { accounts, liabilities, aprs, syncLog } from '@/db/schema';

export async function GET() {
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
      .where(eq(accounts.type, 'credit')),

    db.select().from(aprs).where(eq(aprs.aprType, 'purchase')),

    db
      .select({ completedAt: syncLog.completedAt, status: syncLog.status })
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
      if (due >= monthStart && due <= monthEnd) {
        totalMinPayments += minPayment;
      }
    }

    if (row.isOverdue) pastDueCount++;
    if (limit > 0 && balance > limit) overLimitCount++;
  }

  const weightedAvgApr = totalDebt > 0 ? weightedAprSum / totalDebt : 0;

  return NextResponse.json({
    totalDebt,
    weightedAvgApr,
    totalMinPayments,
    pastDueCount,
    overLimitCount,
    accountCount: creditRows.length,
    lastSyncAt: lastSync[0]?.completedAt ?? null,
    lastSyncStatus: lastSync[0]?.status ?? null,
  });
}
