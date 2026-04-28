import { and, eq, or } from 'drizzle-orm';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/db';
import { accounts, liabilities, aprs, manualOverrides, plaidItems, mxMembers } from '@/db/schema';
import { ScenarioCalculator, type ScenarioAccount } from '@/components/scenario-calculator';

export default async function ScenariosPage() {
  const { userId } = await auth();
  const today = new Date().toISOString().slice(0, 10);
  const userFilter = or(eq(plaidItems.userId, userId!), eq(mxMembers.userId, userId!));

  const [creditRows, purchaseAprs, specialAprs, overrides] = await Promise.all([
    db
      .select({
        accountId: accounts.accountId,
        name: accounts.name,
        balance: accounts.currentBalance,
        minPayment: liabilities.minimumPaymentAmount,
      })
      .from(accounts)
      .leftJoin(plaidItems, eq(plaidItems.id, accounts.itemId))
      .leftJoin(mxMembers, eq(mxMembers.id, accounts.mxMemberId))
      .leftJoin(liabilities, eq(liabilities.accountId, accounts.accountId))
      .where(and(eq(accounts.type, 'credit'), userFilter)),

    db
      .select({ accountId: aprs.accountId, apr: aprs.aprPercentage })
      .from(aprs)
      .innerJoin(accounts, eq(accounts.accountId, aprs.accountId))
      .leftJoin(plaidItems, eq(plaidItems.id, accounts.itemId))
      .leftJoin(mxMembers, eq(mxMembers.id, accounts.mxMemberId))
      .where(and(eq(aprs.aprType, 'purchase_apr'), userFilter)),

    // Special/promo APRs — balance_subject_to_apr is the promotional balance
    db
      .select({
        accountId: aprs.accountId,
        aprPercentage: aprs.aprPercentage,
        balanceSubjectToApr: aprs.balanceSubjectToApr,
      })
      .from(aprs)
      .innerJoin(accounts, eq(accounts.accountId, aprs.accountId))
      .leftJoin(plaidItems, eq(plaidItems.id, accounts.itemId))
      .leftJoin(mxMembers, eq(mxMembers.id, accounts.mxMemberId))
      .where(and(eq(aprs.aprType, 'special'), userFilter)),

    db
      .select({
        accountId: manualOverrides.accountId,
        promoApr: manualOverrides.promoAprPercentage,
        promoExpiration: manualOverrides.promoExpirationDate,
        isDeferredInterest: manualOverrides.isDeferredInterest,
        promoBalance: manualOverrides.promoBalance,
        accruedDeferredInterest: manualOverrides.accruedDeferredInterest,
      })
      .from(manualOverrides)
      .innerJoin(accounts, eq(accounts.accountId, manualOverrides.accountId))
      .leftJoin(plaidItems, eq(plaidItems.id, accounts.itemId))
      .leftJoin(mxMembers, eq(mxMembers.id, accounts.mxMemberId))
      .where(userFilter),
  ]);

  const aprMap = new Map(purchaseAprs.map((a) => [a.accountId, parseFloat(a.apr ?? '0')]));
  // Use the most recent special APR per account (take first if multiple)
  const specialAprMap = new Map(specialAprs.map((a) => [a.accountId, a]));
  const overrideMap = new Map(overrides.map((o) => [o.accountId, o]));

  const scenarioAccounts: ScenarioAccount[] = creditRows
    .map((row) => {
      const balance = parseFloat(row.balance ?? '0');
      const minPayment = parseFloat(row.minPayment ?? '0') || Math.max(25, balance * 0.02);
      const purchaseAprPct = aprMap.get(row.accountId) ?? 0;
      const override = overrideMap.get(row.accountId);
      const specialApr = specialAprMap.get(row.accountId);

      // Promo APR: manual override takes precedence, else use Plaid special APR
      const promoAprPct = override?.promoApr != null
        ? parseFloat(override.promoApr)
        : specialApr?.aprPercentage != null
          ? parseFloat(specialApr.aprPercentage)
          : null;

      const promoActive =
        promoAprPct != null &&
        override?.promoExpiration != null &&
        override.promoExpiration >= today;

      const effectiveAprPct = promoActive ? promoAprPct! : purchaseAprPct;

      const promoExpiresMonths =
        promoActive && override!.promoExpiration
          ? Math.max(
              0,
              Math.round(
                (new Date(override!.promoExpiration).getTime() - Date.now()) /
                  (1000 * 60 * 60 * 24 * 30.44),
              ),
            )
          : undefined;

      // Promo balance: manual override > Plaid balance_subject_to_apr > total balance
      const promoBalance = promoActive
        ? (override?.promoBalance
            ? parseFloat(override.promoBalance)
            : specialApr?.balanceSubjectToApr
              ? parseFloat(specialApr.balanceSubjectToApr)
              : undefined)
        : undefined;

      return {
        accountId: row.accountId,
        name: row.name,
        balance,
        minPayment,
        apr: effectiveAprPct / 100,
        postPromoApr: promoActive ? purchaseAprPct / 100 : undefined,
        promoExpiresMonths,
        isDeferredInterest: promoActive ? (override?.isDeferredInterest ?? false) : false,
        promoBalance,
        accruedDeferredInterest: promoActive && override?.accruedDeferredInterest
          ? parseFloat(override.accruedDeferredInterest)
          : undefined,
      };
    })
    .filter((a) => a.balance > 0.01)
    .sort((a, b) => b.balance - a.balance);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Payoff Scenarios</h1>
        <p className="text-muted-foreground mt-1">
          Model accelerated payoff timelines and compare strategies.
        </p>
      </div>
      <ScenarioCalculator accounts={scenarioAccounts} />
    </div>
  );
}
