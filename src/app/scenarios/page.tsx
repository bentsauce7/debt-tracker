import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { accounts, liabilities, aprs, manualOverrides } from '@/db/schema';
import { ScenarioCalculator, type ScenarioAccount } from '@/components/scenario-calculator';

export default async function ScenariosPage() {
  const today = new Date().toISOString().slice(0, 10);

  const [creditRows, purchaseAprs, overrides] = await Promise.all([
    db
      .select({
        accountId: accounts.accountId,
        name: accounts.name,
        balance: accounts.currentBalance,
        minPayment: liabilities.minimumPaymentAmount,
      })
      .from(accounts)
      .leftJoin(liabilities, eq(liabilities.accountId, accounts.accountId))
      .where(eq(accounts.type, 'credit')),

    db
      .select({ accountId: aprs.accountId, apr: aprs.aprPercentage })
      .from(aprs)
      .where(eq(aprs.aprType, 'purchase_apr')),

    db
      .select({
        accountId: manualOverrides.accountId,
        promoApr: manualOverrides.promoAprPercentage,
        promoExpiration: manualOverrides.promoExpirationDate,
        isDeferredInterest: manualOverrides.isDeferredInterest,
      })
      .from(manualOverrides),
  ]);

  const aprMap = new Map(purchaseAprs.map((a) => [a.accountId, parseFloat(a.apr ?? '0')]));
  const overrideMap = new Map(overrides.map((o) => [o.accountId, o]));

  const scenarioAccounts: ScenarioAccount[] = creditRows
    .map((row) => {
      const balance = parseFloat(row.balance ?? '0');
      const minPayment = parseFloat(row.minPayment ?? '0') || Math.max(25, balance * 0.02);
      const purchaseAprPct = aprMap.get(row.accountId) ?? 0;
      const override = overrideMap.get(row.accountId);

      const promoActive =
        override?.promoApr != null &&
        override.promoExpiration != null &&
        override.promoExpiration >= today;

      const effectiveAprPct = promoActive
        ? parseFloat(override!.promoApr ?? '0')
        : purchaseAprPct;

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

      return {
        accountId: row.accountId,
        name: row.name,
        balance,
        minPayment,
        apr: effectiveAprPct / 100,
        postPromoApr: promoActive ? purchaseAprPct / 100 : undefined,
        promoExpiresMonths,
        isDeferredInterest: promoActive ? (override?.isDeferredInterest ?? false) : false,
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
