'use client';

import { useState } from 'react';
import { Plus, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { ExtractedPromoPurchase } from '@/db/schema';

type Statement = {
  statementDate: string;
  extractedPromoPurchases: ExtractedPromoPurchase[] | null;
};

type ExistingPurchase = {
  purchaseAmount: string;
  description: string | null;
};

type Suggestion = ExtractedPromoPurchase & { statementDate: string };

const FREQUENCY_LABELS: Record<NonNullable<ExtractedPromoPurchase['feeFrequency']>, string> = {
  monthly: '/mo',
  quarterly: '/qtr',
  annual: '/yr',
  one_time: ' one-time',
};

function formatPlanFee(s: Suggestion): string | null {
  if (s.feeAmount == null || !s.feeType) return null;
  const value =
    s.feeType === 'percentage'
      ? `${s.feeAmount}% fee`
      : `$${s.feeAmount.toFixed(2)} fee`;
  const cadence = s.feeFrequency ? FREQUENCY_LABELS[s.feeFrequency] : '';
  return `${value}${cadence}`;
}

export function PromoPurchaseSuggestions({
  accountId,
  statements,
  existingPurchases,
}: {
  accountId: string;
  statements: Statement[];
  existingPurchases: ExistingPurchase[];
}) {
  // Collect all suggestions, dedup by amount+description
  const seen = new Set<string>();
  const suggestions: Suggestion[] = [];

  for (const stmt of statements) {
    for (const p of stmt.extractedPromoPurchases ?? []) {
      const key = `${p.description}|${p.amount}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // Skip if already tracked
      const alreadyAdded = existingPurchases.some(
        (ep) =>
          Math.abs(parseFloat(ep.purchaseAmount) - p.amount) < 0.01 &&
          (ep.description ?? '').toLowerCase().includes(p.description.toLowerCase().slice(0, 5)),
      );
      if (!alreadyAdded) suggestions.push({ ...p, statementDate: stmt.statementDate });
    }
  }

  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [promoEndDate, setPromoEndDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [added, setAdded] = useState<Set<string>>(new Set());

  const visible = suggestions.filter((s) => {
    const key = `${s.description}|${s.amount}`;
    return !dismissed.has(key) && !added.has(key);
  });

  if (visible.length === 0) return null;

  async function handleAdd(s: Suggestion) {
    const key = `${s.description}|${s.amount}`;
    if (!promoEndDate && !s.promoEndDate) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/accounts/${accountId}/promo-purchases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: s.description,
          purchaseAmount: s.amount,
          purchaseDate: s.purchaseDate ?? null,
          promoEndDate: promoEndDate || s.promoEndDate,
          isDeferredInterest: s.isDeferredInterest,
          feeAmount: s.feeAmount ?? null,
          feeType: s.feeType ?? null,
          feeFrequency: s.feeFrequency ?? null,
          accruedDeferredInterest: s.accruedDeferredInterest ?? null,
        }),
      });
      if (!res.ok) throw new Error();
      setAdded((prev) => new Set(prev).add(key));
      setAddingKey(null);
      setPromoEndDate('');
    } catch {
      // stay open on failure
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          Detected Promotional Purchases
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Found in your statement history. Add the ones you want to track.
        </p>
        <div className="space-y-2">
          {visible.map((s) => {
            const key = `${s.description}|${s.amount}`;
            const isExpanding = addingKey === key;
            return (
              <div key={key} className="rounded-md border bg-background p-3 space-y-2">
                <div className="flex items-start justify-between gap-4">
                  <div className="text-sm space-y-0.5">
                    <p className="font-medium">{s.description}</p>
                    <p className="text-muted-foreground">
                      {formatCurrency(s.amount.toString())}
                      {s.purchaseDate ? ` · ${formatDate(s.purchaseDate)}` : ''}
                      {s.isDeferredInterest ? ' · Deferred interest' : ''}
                      {s.promoEndDate ? ` · Promo ends ${formatDate(s.promoEndDate)}` : ''}
                      {formatPlanFee(s) ? ` · ${formatPlanFee(s)}` : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      From statement {formatDate(s.statementDate)}
                    </p>
                  </div>
                  {!isExpanding && (
                    <div className="flex gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        onClick={() => {
                          setAddingKey(key);
                          setPromoEndDate(s.promoEndDate ?? '');
                        }}
                      >
                        <Plus className="h-3 w-3" />
                        Add
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDismissed((prev) => new Set(prev).add(key))}
                      >
                        Dismiss
                      </Button>
                    </div>
                  )}
                </div>
                {isExpanding && (
                  <div className="space-y-3 pt-1 border-t">
                    {!s.promoEndDate && (
                      <div className="space-y-1 max-w-xs">
                        <Label htmlFor={`end-${key}`} className="text-xs">Promo end date</Label>
                        <Input
                          id={`end-${key}`}
                          type="date"
                          value={promoEndDate}
                          onChange={(e) => setPromoEndDate(e.target.value)}
                          required
                        />
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button size="sm" disabled={saving || (!promoEndDate && !s.promoEndDate)} onClick={() => handleAdd(s)}>
                        {saving ? 'Adding…' : 'Confirm'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setAddingKey(null); setPromoEndDate(''); }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
