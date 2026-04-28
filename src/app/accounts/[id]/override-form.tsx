'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle2 } from 'lucide-react';

type Override = {
  promoExpirationDate: string | null;
  isDeferredInterest: boolean | null;
  promoAprPercentage: string | null;
  promoBalance: string | null;
  accruedDeferredInterest: string | null;
  notes: string | null;
};

export function OverrideForm({ accountId, initial }: { accountId: string; initial: Override | null }) {
  const [promoExpirationDate, setPromoExpirationDate] = useState(initial?.promoExpirationDate ?? '');
  const [isDeferredInterest, setIsDeferredInterest] = useState(initial?.isDeferredInterest ?? false);
  const [promoAprPercentage, setPromoAprPercentage] = useState(initial?.promoAprPercentage ?? '');
  const [promoBalance, setPromoBalance] = useState(initial?.promoBalance ?? '');
  const [accruedDeferredInterest, setAccruedDeferredInterest] = useState(initial?.accruedDeferredInterest ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);

    try {
      const res = await fetch(`/api/accounts/${accountId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promoExpirationDate: promoExpirationDate || null,
          isDeferredInterest,
          promoAprPercentage: promoAprPercentage ? parseFloat(promoAprPercentage) : null,
          promoBalance: promoBalance ? parseFloat(promoBalance) : null,
          accruedDeferredInterest: accruedDeferredInterest ? parseFloat(accruedDeferredInterest) : null,
          notes: notes || null,
        }),
      });

      if (!res.ok) throw new Error('Save failed');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="promoExp">Promo Expiration Date</Label>
          <Input
            id="promoExp"
            type="date"
            value={promoExpirationDate}
            onChange={(e) => setPromoExpirationDate(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="promoApr">Promo APR (%)</Label>
          <Input
            id="promoApr"
            type="number"
            step="0.001"
            min="0"
            max="100"
            value={promoAprPercentage}
            onChange={(e) => setPromoAprPercentage(e.target.value)}
            placeholder="e.g. 0 for 0% promo"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          id="deferredInterest"
          type="checkbox"
          checked={isDeferredInterest}
          onChange={(e) => setIsDeferredInterest(e.target.checked)}
          className="h-4 w-4 rounded border-input"
        />
        <Label htmlFor="deferredInterest" className="cursor-pointer">
          Deferred interest (interest accrues but is waived if paid off by promo end)
        </Label>
      </div>

      {isDeferredInterest && (
        <div className="grid gap-4 sm:grid-cols-2 pl-6 border-l-2 border-amber-200">
          <div className="space-y-2">
            <Label htmlFor="promoBalance">Promo Balance ($)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input
                id="promoBalance"
                type="number"
                step="0.01"
                min="0"
                value={promoBalance}
                onChange={(e) => setPromoBalance(e.target.value)}
                placeholder="Amount under promo rate"
                className="pl-7"
              />
            </div>
            <p className="text-xs text-muted-foreground">The specific balance that must be paid off by the deadline</p>

          </div>
          <div className="space-y-2">
            <Label htmlFor="accruedDeferred">Accrued Deferred Interest ($)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input
                id="accruedDeferred"
                type="number"
                step="0.01"
                min="0"
                value={accruedDeferredInterest}
                onChange={(e) => setAccruedDeferredInterest(e.target.value)}
                placeholder="Interest at risk if deadline missed"
                className="pl-7"
              />
            </div>
            <p className="text-xs text-muted-foreground">Retroactively charged if promo balance is not cleared in time</p>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any additional notes about this account…"
          rows={3}
        />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save overrides'}
        </Button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-green-700">
            <CheckCircle2 className="h-4 w-4" />
            Saved
          </span>
        )}
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>
    </form>
  );
}
