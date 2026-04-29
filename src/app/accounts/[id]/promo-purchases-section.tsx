'use client';

import { useState } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency, formatDate } from '@/lib/utils';

type PromoPurchase = {
  id: string;
  description: string | null;
  purchaseAmount: string;
  purchaseDate: string | null;
  promoEndDate: string;
  isDeferredInterest: boolean;
};

function calcRequiredMonthly(purchaseAmount: string, promoEndDate: string): number | null {
  const amount = parseFloat(purchaseAmount);
  const daysLeft = Math.ceil((new Date(promoEndDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (daysLeft <= 0) return null;
  const monthsLeft = Math.max(1, Math.round(daysLeft / 30.44));
  return amount / monthsLeft;
}

function daysRemaining(promoEndDate: string): number {
  return Math.ceil((new Date(promoEndDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export function PromoPurchasesSection({
  accountId,
  initial,
}: {
  accountId: string;
  initial: PromoPurchase[];
}) {
  const [purchases, setPurchases] = useState<PromoPurchase[]>(initial);
  const [showForm, setShowForm] = useState(false);
  const [description, setDescription] = useState('');
  const [purchaseAmount, setPurchaseAmount] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [promoEndDate, setPromoEndDate] = useState('');
  const [isDeferredInterest, setIsDeferredInterest] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/accounts/${accountId}/promo-purchases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: description || null,
          purchaseAmount: parseFloat(purchaseAmount),
          purchaseDate: purchaseDate || null,
          promoEndDate,
          isDeferredInterest,
        }),
      });
      if (!res.ok) throw new Error('Failed to save');
      const created = await res.json();
      setPurchases((prev) => [...prev, created]);
      setDescription('');
      setPurchaseAmount('');
      setPurchaseDate('');
      setPromoEndDate('');
      setIsDeferredInterest(false);
      setShowForm(false);
    } catch {
      setError('Failed to save purchase');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/promo-purchases/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      setPurchases((prev) => prev.filter((p) => p.id !== id));
    } catch {
      // silently fail — purchase stays in list
    } finally {
      setDeletingId(null);
    }
  }

  const totalRequired = purchases.reduce((sum, p) => {
    const monthly = calcRequiredMonthly(p.purchaseAmount, p.promoEndDate);
    return sum + (monthly ?? 0);
  }, 0);

  return (
    <div className="space-y-4">
      {purchases.length > 0 && (
        <div className="space-y-3">
          {purchases.map((p) => {
            const days = daysRemaining(p.promoEndDate);
            const monthly = calcRequiredMonthly(p.purchaseAmount, p.promoEndDate);
            return (
              <div key={p.id} className="flex items-start justify-between gap-4 text-sm border-b pb-3 last:border-0">
                <div className="space-y-0.5 min-w-0">
                  <p className="font-medium truncate">{p.description ?? 'Promotional purchase'}</p>
                  <p className="text-muted-foreground">
                    {formatCurrency(p.purchaseAmount)}
                    {p.purchaseDate ? ` · purchased ${formatDate(p.purchaseDate)}` : ''}
                  </p>
                  <p className="text-muted-foreground">
                    Expires {formatDate(p.promoEndDate)} ·{' '}
                    {days > 0 ? `${days} day${days !== 1 ? 's' : ''} left` : 'Expired'}
                    {p.isDeferredInterest ? ' · Deferred interest' : ''}
                  </p>
                  {monthly && (
                    <p className="text-amber-700 font-medium">
                      {formatCurrency(monthly)}/mo to clear in time
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  disabled={deletingId === p.id}
                  onClick={() => handleDelete(p.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
          {purchases.length > 1 && (
            <div className="flex justify-between text-sm font-semibold pt-1">
              <span>Total required monthly</span>
              <span>{formatCurrency(totalRequired)}/mo</span>
            </div>
          )}
        </div>
      )}

      {showForm ? (
        <form onSubmit={handleAdd} className="space-y-4 pt-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="pp-desc">Description (optional)</Label>
              <Input
                id="pp-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Laptop, Furniture"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pp-amount">Purchase Amount</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  id="pp-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={purchaseAmount}
                  onChange={(e) => setPurchaseAmount(e.target.value)}
                  placeholder="0.00"
                  className="pl-7"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pp-purchase-date">Purchase Date (optional)</Label>
              <Input
                id="pp-purchase-date"
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pp-end-date">Promo End Date</Label>
              <Input
                id="pp-end-date"
                type="date"
                required
                value={promoEndDate}
                onChange={(e) => setPromoEndDate(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="pp-deferred"
              type="checkbox"
              checked={isDeferredInterest}
              onChange={(e) => setIsDeferredInterest(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            <Label htmlFor="pp-deferred" className="cursor-pointer">Deferred interest</Label>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? 'Saving…' : 'Add purchase'}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => setShowForm(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          Add promotional purchase
        </Button>
      )}
    </div>
  );
}
