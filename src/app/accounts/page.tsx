import { eq, desc } from 'drizzle-orm';
import { db } from '@/db';
import { accounts, liabilities, aprs, plaidItems } from '@/db/schema';
import { AccountsTable } from '@/components/accounts-table';

async function getAccounts() {
  const [rows, purchaseAprs] = await Promise.all([
    db
      .select({
        accountId: accounts.accountId,
        name: accounts.name,
        mask: accounts.mask,
        officialName: accounts.officialName,
        type: accounts.type,
        subtype: accounts.subtype,
        currentBalance: accounts.currentBalance,
        creditLimit: accounts.creditLimit,
        isOverdue: accounts.isOverdue,
        institutionName: plaidItems.institutionName,
        minimumPaymentAmount: liabilities.minimumPaymentAmount,
        nextPaymentDueDate: liabilities.nextPaymentDueDate,
      })
      .from(accounts)
      .leftJoin(plaidItems, eq(plaidItems.id, accounts.itemId))
      .leftJoin(liabilities, eq(liabilities.accountId, accounts.accountId))
      .orderBy(desc(accounts.currentBalance)),

    db.select().from(aprs).where(eq(aprs.aprType, 'purchase')),
  ]);

  const aprMap = new Map(purchaseAprs.map((a) => [a.accountId, a.aprPercentage]));

  return rows.map((row) => ({
    ...row,
    purchaseApr: aprMap.get(row.accountId) ?? null,
  }));
}

export default async function AccountsPage() {
  const rows = await getAccounts();

  const totalBalance = rows.reduce((sum, r) => sum + parseFloat(r.currentBalance ?? '0'), 0);
  const creditRows = rows.filter((r) => r.type === 'credit');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Accounts</h1>
        <p className="text-muted-foreground mt-1">
          {rows.length} account{rows.length !== 1 ? 's' : ''} ·{' '}
          {creditRows.length} credit · total balance $
          {totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
      </div>
      <AccountsTable rows={rows} />
    </div>
  );
}
