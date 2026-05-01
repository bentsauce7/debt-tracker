'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency, formatPercent } from '@/lib/utils';
import { TrendingDown, AlertCircle, AlertTriangle, Clock } from 'lucide-react';

export type ScenarioAccount = {
  accountId: string;
  name: string;
  balance: number;
  minPayment: number;
  apr: number;              // effective APR right now (promo rate if active, else purchase)
  postPromoApr?: number;    // purchase APR to switch to after promo expires
  promoExpiresMonths?: number; // months until promo expires (0 = this month)
  isDeferredInterest?: boolean;
  promoBalance?: number;    // specific balance that must be cleared by deadline
  accruedDeferredInterest?: number; // interest at risk if deadline missed
  monthlyPromoFee?: number; // installment-plan fees charged each month during promo
};

export type DeferredDeadline = {
  accountId: string;
  accountName: string;
  description: string;
  balance: number;
  promoEndDate: string;
  expiresMonths: number;
  // null when the purchase has no purchaseDate (statement didn't disclose one
  // and we can't compute interest accrued so far).
  accruedInterest: number | null;
};

type AccountResult = {
  name: string;
  paidOffMonth: number;
  interestPaid: number;
  feesPaid: number;
  deferredInterestHit?: boolean; // deferred interest was charged at promo expiry
};

type SimResult = {
  months: number;
  totalInterest: number;
  totalFees: number;
  accounts: AccountResult[];
};

function simulate(
  accounts: ScenarioAccount[],
  extraPayment: number,
  strategy: 'avalanche' | 'snowball',
): SimResult | null {
  if (accounts.length === 0) return null;

  type State = {
    accountId: string;
    name: string;
    balance: number;
    minPayment: number;
    apr: number;
    postPromoApr?: number;
    promoExpiresMonths?: number;
    isDeferredInterest?: boolean;
    monthlyPromoFee?: number;
    interestPaid: number;
    feesPaid: number;
    deferredInterestAccrued: number; // tracked separately, only charged on expiry if balance > 0
    paidOffMonth: number | null;
    deferredInterestHit: boolean;
  };

  const state: State[] = accounts.map((a) => ({
    ...a,
    interestPaid: 0,
    feesPaid: 0,
    deferredInterestAccrued: 0,
    paidOffMonth: null,
    deferredInterestHit: false,
  }));

  let month = 0;
  let totalInterest = 0;
  let totalFees = 0;
  let rollingExtra = extraPayment;
  const MAX_MONTHS = 600;

  while (state.some((s) => s.balance > 0.005) && month < MAX_MONTHS) {
    month++;

    // 1. Accrue interest (handle promo/deferred interest)
    for (const acct of state) {
      if (acct.balance <= 0) continue;

      const inPromo = acct.promoExpiresMonths !== undefined && acct.promoExpiresMonths > 0;
      const promoExpiredThisMonth =
        acct.promoExpiresMonths !== undefined && acct.promoExpiresMonths === 0;

      if (promoExpiredThisMonth) {
        // Switch to post-promo rate
        acct.apr = acct.postPromoApr ?? acct.apr;

        // Deferred interest: if balance remains, dump accumulated deferred interest onto balance
        if (acct.isDeferredInterest && acct.balance > 0.005) {
          acct.balance += acct.deferredInterestAccrued;
          acct.interestPaid += acct.deferredInterestAccrued;
          totalInterest += acct.deferredInterestAccrued;
          acct.deferredInterestHit = true;
          acct.deferredInterestAccrued = 0;
        }

        acct.promoExpiresMonths = undefined; // promo done
      }

      if (acct.promoExpiresMonths !== undefined) {
        acct.promoExpiresMonths = Math.max(0, acct.promoExpiresMonths - 1);
      }

      const monthlyRate = acct.apr / 12;
      const interest = acct.balance * monthlyRate;

      if (inPromo && acct.isDeferredInterest) {
        // Deferred interest: accrue but don't add to balance yet
        acct.deferredInterestAccrued += interest;
      } else {
        acct.balance += interest;
        acct.interestPaid += interest;
        totalInterest += interest;
      }

      // Installment-plan fees: charged during promo (and the expiry month).
      // Stop once balance hits zero or promo ends.
      const promoActiveThisMonth = inPromo || promoExpiredThisMonth;
      if (promoActiveThisMonth && acct.monthlyPromoFee && acct.balance > 0) {
        const fee = acct.monthlyPromoFee;
        acct.balance += fee;
        acct.feesPaid += fee;
        totalFees += fee;
      }
    }

    // 2. Pay minimums; freed minimums roll into extra pool
    for (const acct of state) {
      if (acct.balance <= 0) continue;
      const payment = Math.min(acct.minPayment, acct.balance);
      acct.balance = Math.max(0, acct.balance - payment);
      if (acct.balance < 0.005) {
        acct.balance = 0;
        acct.deferredInterestAccrued = 0; // paid off before promo expired — no deferred hit
        if (acct.paidOffMonth === null) {
          acct.paidOffMonth = month;
          rollingExtra += acct.minPayment;
        }
      }
    }

    // 3. Apply rolling extra to targets in strategy order
    const active = state.filter((a) => a.balance > 0);
    if (active.length === 0) break;

    // Avalanche: highest APR first (use postPromoApr if promo is ending soon for true urgency sort)
    // Snowball: lowest balance first
    const ordered =
      strategy === 'avalanche'
        ? [...active].sort((a, b) => {
            const aprA = a.postPromoApr ?? a.apr;
            const aprB = b.postPromoApr ?? b.apr;
            return aprB - aprA || a.balance - b.balance;
          })
        : [...active].sort((a, b) => a.balance - b.balance || b.apr - a.apr);

    let remaining = rollingExtra;
    for (const target of ordered) {
      if (remaining <= 0.005) break;
      const payment = Math.min(remaining, target.balance);
      remaining -= payment;
      target.balance = Math.max(0, target.balance - payment);
      if (target.balance < 0.005) {
        target.balance = 0;
        target.deferredInterestAccrued = 0;
        if (target.paidOffMonth === null) {
          target.paidOffMonth = month;
          rollingExtra += target.minPayment;
        }
      }
    }
  }

  return {
    months: month,
    totalInterest,
    totalFees,
    accounts: state
      .map((s) => ({
        name: s.name,
        paidOffMonth: s.paidOffMonth ?? month,
        interestPaid: s.interestPaid,
        feesPaid: s.feesPaid,
        deferredInterestHit: s.deferredInterestHit,
      }))
      .sort((a, b) => a.paidOffMonth - b.paidOffMonth),
  };
}

function formatMonths(months: number): string {
  if (months >= 600) return '50+ years';
  const years = Math.floor(months / 12);
  const mo = months % 12;
  if (years === 0) return `${mo}mo`;
  if (mo === 0) return `${years}yr`;
  return `${years}yr ${mo}mo`;
}

function StrategyCard({
  title,
  description,
  result,
  baseline,
}: {
  title: string;
  description: string;
  result: SimResult | null;
  baseline: SimResult | null;
}) {
  if (!result) return null;
  const totalCost = result.totalInterest + result.totalFees;
  const baselineCost = baseline ? baseline.totalInterest + baseline.totalFees : 0;
  const costSaved = baseline ? baselineCost - totalCost : 0;
  const monthsSaved = baseline ? baseline.months - result.months : 0;

  return (
    <Card className="flex-1">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Payoff in</p>
            <p className="text-2xl font-bold">{formatMonths(result.months)}</p>
            {monthsSaved > 0 && (
              <p className="text-xs text-green-600">{formatMonths(monthsSaved)} sooner</p>
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total cost</p>
            <p className="text-2xl font-bold">{formatCurrency(totalCost)}</p>
            {result.totalFees > 0 && (
              <p className="text-xs text-muted-foreground">
                {formatCurrency(result.totalInterest)} interest + {formatCurrency(result.totalFees)} plan fees
              </p>
            )}
            {costSaved > 0 && (
              <p className="text-xs text-green-600">{formatCurrency(costSaved)} saved</p>
            )}
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Payoff order</p>
          <ol className="space-y-2">
            {result.accounts.map((acct, i) => {
              const cost = acct.interestPaid + acct.feesPaid;
              return (
                <li key={acct.name} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                    <span className="font-medium truncate max-w-[160px]">{acct.name}</span>
                    {acct.deferredInterestHit && (
                      <span title="Deferred interest was charged">
                        <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                      </span>
                    )}
                  </span>
                  <span className="text-muted-foreground text-xs shrink-0 ml-2">
                    {formatMonths(acct.paidOffMonth)} · {formatCurrency(cost)}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}

export function ScenarioCalculator({
  accounts,
  deferredDeadlines = [],
}: {
  accounts: ScenarioAccount[];
  deferredDeadlines?: DeferredDeadline[];
}) {
  const [extra, setExtra] = useState('');
  const extraPayment = Math.max(0, parseFloat(extra) || 0);

  const baseline = useMemo(() => simulate(accounts, 0, 'avalanche'), [accounts]);
  const avalanche = useMemo(() => simulate(accounts, extraPayment, 'avalanche'), [accounts, extraPayment]);
  const snowball = useMemo(() => simulate(accounts, extraPayment, 'snowball'), [accounts, extraPayment]);

  if (accounts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center space-y-2">
        <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto" />
        <p className="text-muted-foreground">No credit accounts with balances found. Sync your accounts first.</p>
      </div>
    );
  }

  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);
  const totalMinPayments = accounts.reduce((s, a) => s + a.minPayment, 0);
  const promoAccounts = accounts.filter((a) => a.promoExpiresMonths !== undefined);
  // Limit the panel to imminent deadlines: this month and next month only.
  // Further-out cohorts are kept in the database but suppressed from this
  // panel to avoid clogging the page.
  const visibleDeadlines = deferredDeadlines.filter((d) => d.expiresMonths <= 1);
  const hiddenDeadlineCount = deferredDeadlines.length - visibleDeadlines.length;
  const totalDeferredAtRisk = visibleDeadlines.reduce(
    (s, d) => s + (d.accruedInterest ?? 0),
    0,
  );

  return (
    <div className="space-y-8">
      {/* Summary */}
      <div className="flex flex-wrap gap-6 text-sm">
        <div>
          <p className="text-muted-foreground">Total balance</p>
          <p className="text-xl font-bold">{formatCurrency(totalBalance)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Monthly minimums</p>
          <p className="text-xl font-bold">{formatCurrency(totalMinPayments)}</p>
        </div>
        {baseline && (
          <div>
            <p className="text-muted-foreground">Payoff on minimums only</p>
            <p className="text-xl font-bold">
              {formatMonths(baseline.months)} ·{' '}
              {formatCurrency(baseline.totalInterest + baseline.totalFees)} cost
            </p>
          </div>
        )}
      </div>

      {/* Promo Deadlines panel — one row per active deferred-interest purchase */}
      {visibleDeadlines.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-amber-800">
              <Clock className="h-4 w-4" />
              Promo Deadlines
              {totalDeferredAtRisk > 0 && (
                <span className="ml-auto text-sm font-normal text-amber-700">
                  {formatCurrency(totalDeferredAtRisk)} total at risk
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-amber-700 border-b border-amber-200">
                  <th className="text-left pb-2 font-medium">Purchase</th>
                  <th className="text-right pb-2 font-medium">Balance</th>
                  <th className="text-right pb-2 font-medium">Interest at risk</th>
                  <th className="text-right pb-2 font-medium">Deadline</th>
                  <th className="text-right pb-2 font-medium">Need/mo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100">
                {visibleDeadlines.map((d, i) => {
                  const months = d.expiresMonths;
                  const required = months > 0 ? d.balance / months : d.balance;
                  const urgent = months <= 2;
                  return (
                    <tr
                      key={`${d.accountId}-${d.promoEndDate}-${i}`}
                      className={urgent ? 'text-red-700' : 'text-amber-900'}
                    >
                      <td className="py-2 font-medium">
                        <div>{d.accountName}</div>
                        <div className="text-xs font-normal opacity-80 truncate max-w-[280px]">
                          {d.description}
                        </div>
                      </td>
                      <td className="py-2 text-right font-mono">{formatCurrency(d.balance)}</td>
                      <td className="py-2 text-right font-mono">
                        {d.accruedInterest != null ? formatCurrency(d.accruedInterest) : '—'}
                      </td>
                      <td className="py-2 text-right">
                        {months === 0 ? (
                          <span className="font-semibold">This month</span>
                        ) : (
                          `${months}mo`
                        )}
                      </td>
                      <td className="py-2 text-right font-mono font-semibold">
                        {formatCurrency(required)}/mo
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="text-xs text-amber-700 mt-3">
              Each row is a single deferred-interest purchase. Pay at least the required monthly amount on each before its deadline to avoid having all accrued interest charged retroactively.
              {hiddenDeadlineCount > 0 &&
                ` ${hiddenDeadlineCount} additional deferred ${hiddenDeadlineCount === 1 ? 'deadline is' : 'deadlines are'} more than a month away and not shown here.`}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Extra payment input */}
      <div className="max-w-xs space-y-2">
        <Label htmlFor="extra">Extra monthly payment</Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
          <Input
            id="extra"
            type="number"
            min="0"
            step="50"
            placeholder="0"
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            className="pl-7"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Amount above minimums applied each month · total payment{' '}
          {formatCurrency(totalMinPayments + extraPayment)}/mo
        </p>
      </div>

      {/* Strategy cards */}
      <div className="flex flex-col sm:flex-row gap-4">
        <StrategyCard
          title="Avalanche"
          description="Highest APR first — minimizes total interest paid"
          result={avalanche}
          baseline={baseline}
        />
        <StrategyCard
          title="Snowball"
          description="Lowest balance first — fastest psychological wins"
          result={snowball}
          baseline={baseline}
        />
      </div>

      {/* Account details table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account Details</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b">
                <th className="text-left pb-2 font-medium">Account</th>
                <th className="text-right pb-2 font-medium">Balance</th>
                <th className="text-right pb-2 font-medium">APR</th>
                <th className="text-right pb-2 font-medium">Min. payment</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {accounts.map((acct) => (
                <tr key={acct.accountId}>
                  <td className="py-2 font-medium">
                    <div>{acct.name}</div>
                    {acct.promoExpiresMonths !== undefined && (
                      <div className="text-xs text-amber-600">
                        {acct.isDeferredInterest ? 'Deferred interest' : 'Promo rate'} ·{' '}
                        {acct.promoExpiresMonths === 0
                          ? 'expires this month'
                          : `${acct.promoExpiresMonths}mo left`}
                        {acct.postPromoApr !== undefined &&
                          ` → ${formatPercent(acct.postPromoApr * 100)}`}
                      </div>
                    )}
                  </td>
                  <td className="py-2 text-right">{formatCurrency(acct.balance)}</td>
                  <td className="py-2 text-right">
                    {acct.apr > 0 ? (
                      formatPercent(acct.apr * 100)
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-2 text-right">{formatCurrency(acct.minPayment)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="space-y-1">
        <p className="text-xs text-muted-foreground flex items-start gap-1.5">
          <TrendingDown className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          Calculations assume fixed minimum payments and current APRs. MX-connected accounts may show
          estimated minimums (2% of balance) and 0% APR if liability data is unavailable.
        </p>
        {promoAccounts.length > 0 && (
          <p className="text-xs text-amber-600 flex items-start gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            Deferred interest accounts that are not paid off before their promo expires will have all
            accrued interest added to the balance at that point.
          </p>
        )}
      </div>
    </div>
  );
}
