import { and, eq, or } from 'drizzle-orm';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/db';
import { accounts, liabilities, aprs, manualOverrides, plaidItems, mxMembers, promoPurchases } from '@/db/schema';
import { ScenarioCalculator, type ScenarioAccount } from '@/components/scenario-calculator';

export default async function ScenariosPage() {
  const { userId } = await auth();
  const today = new Date().toISOString().slice(0, 10);
  const userFilter = or(eq(plaidItems.userId, userId!), eq(mxMembers.userId, userId!));

  const [creditRows, purchaseAprs, specialAprs, overrides, trackedPromos] = await Promise.all([
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

    db
      .select({
        accountId: promoPurchases.accountId,
        purchaseAmount: promoPurchases.purchaseAmount,
        promoEndDate: promoPurchases.promoEndDate,
        isDeferredInterest: promoPurchases.isDeferredInterest,
      })
      .from(promoPurchases)
      .innerJoin(accounts, eq(accounts.accountId, promoPurchases.accountId))
      .leftJoin(plaidItems, eq(plaidItems.id, accounts.itemId))
      .leftJoin(mxMembers, eq(mxMembers.id, accounts.mxMemberId))
      .where(userFilter),
  ]);

  const aprMap = new Map(purchaseAprs.map((a) => [a.accountId, parseFloat(a.apr ?? '0')]));
  // Use the most recent special APR per account (take first if multiple)
  const specialAprMap = new Map(specialAprs.map((a) => [a.accountId, a]));
  const overrideMap = new Map(overrides.map((o) => [o.accountId, o]));

  // Aggregate active (not-yet-expired) tracked promo purchases per account:
  // sum balance, earliest expiration, deferred-interest if any.
  const promoAggregateMap = new Map<
    string,
    { balance: number; earliestEnd: string; anyDeferred: boolean }
  >();
  for (const p of trackedPromos) {
    if (p.promoEndDate < today) continue;
    const existing = promoAggregateMap.get(p.accountId);
    const amount = parseFloat(p.purchaseAmount);
    if (!existing) {
      promoAggregateMap.set(p.accountId, {
        balance: amount,
        earliestEnd: p.promoEndDate,
        anyDeferred: p.isDeferredInterest,
      });
    } else {
      existing.balance += amount;
      if (p.promoEndDate < existing.earliestEnd) existing.earliestEnd = p.promoEndDate;
      if (p.isDeferredInterest) existing.anyDeferred = true;
    }
  }

  const scenarioAccounts: ScenarioAccount[] = creditRows
    .map((row) => {
      const balance = parseFloat(row.balance ?? '0');
      const minPayment = parseFloat(row.minPayment ?? '0') || Math.max(25, balance * 0.02);
      const purchaseAprPct = aprMap.get(row.accountId) ?? 0;
      const override = overrideMap.get(row.accountId);
      const specialApr = specialAprMap.get(row.accountId);
      const aggregate = promoAggregateMap.get(row.accountId);

      // Promo APR: manual override > Plaid special APR > 0% default when tracked
      // purchases exist (promo_purchases has no APR column; promotional purchases
      // are typically 0% offers).
      const promoAprPct = override?.promoApr != null
        ? parseFloat(override.promoApr)
        : specialApr?.aprPercentage != null
          ? parseFloat(specialApr.aprPercentage)
          : aggregate
            ? 0
            : null;

      // Promo expiration: aggregated earliest end from tracked purchases > manual override
      const effectivePromoExpiration = aggregate?.earliestEnd ?? override?.promoExpiration ?? null;

      const promoActive =
        promoAprPct != null &&
        effectivePromoExpiration != null &&
        effectivePromoExpiration >= today;

      const effectiveAprPct = promoActive ? promoAprPct! : purchaseAprPct;

      const promoExpiresMonths =
        promoActive && effectivePromoExpiration
          ? Math.max(
              0,
              Math.round(
                (new Date(effectivePromoExpiration).getTime() - Date.now()) /
                  (1000 * 60 * 60 * 24 * 30.44),
              ),
            )
          : undefined;

      // Promo balance: aggregated tracked-purchase total > manual override > Plaid balance_subject_to_apr
      const promoBalance = promoActive
        ? aggregate
          ? aggregate.balance
          : override?.promoBalance
            ? parseFloat(override.promoBalance)
            : specialApr?.balanceSubjectToApr
              ? parseFloat(specialApr.balanceSubjectToApr)
              : undefined
        : undefined;

      // Deferred-interest: any deferred among tracked purchases > manual override flag
      const isDeferredInterest = promoActive
        ? (aggregate?.anyDeferred ?? override?.isDeferredInterest ?? false)
        : false;

      return {
        accountId: row.accountId,
        name: row.name,
        balance,
        minPayment,
        apr: effectiveAprPct / 100,
        postPromoApr: promoActive ? purchaseAprPct / 100 : undefined,
        promoExpiresMonths,
        isDeferredInterest,
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
