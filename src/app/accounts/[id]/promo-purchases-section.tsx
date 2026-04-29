'use client';

import { useState } from 'react';
import { Trash2, Plus, ChevronRight } from 'lucide-react';
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

type Transaction = {
  id: string;
  transactionId: string;
  name: string;
  merchantName: string | null;
  amount: string;
  date: string;
  pending: boolean;
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

type Mode = 'idle' | 'pick-transaction' | 'manual-form' | 'confirm-transaction';

export function PromoPurchasesSection({
  accountId,
  initial,
  availableTransactions,
}: {
  accountId: string;
  initial: PromoPurchase[];
  availableTransactions: Transaction[];
}) {
  const [purchases, setPurchases] = useState<PromoPurchase[]>(initial);
  const [mode, setMode] = useState<Mode>('idle');
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  // Shared form state
  const [description, setDescription] = useState('');
  const [purchaseAmount, setPurchaseAmount] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [promoEndDate, setPromoEndDate] = useState('');
  const [isDeferredInterest, setIsDeferredInterest] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Posted purchases only (positive = debit on credit card)
  const eligibleTransactions = availableTransactions.filter((t) => !t.pending && parseFloat(t.amount) > 0);

  function resetForm() {
    setDescription('');
    setPurchaseAmount('');
    setPurchaseDate('');
    setPromoEndDate('');
    setIsDeferredInterest(false);
    setError(null);
    setSelectedTx(null);
    setMode('idle');
  }

  function selectTransaction(tx: Transaction) {
    setSelectedTx(tx);
    setDescription(tx.merchantName ?? tx.name);
    setPurchaseAmount(tx.amount);
    setPurchaseDate(tx.date);
    setPromoEndDate('');
    setIsDeferredInterest(false);
    setMode('confirm-transaction');
  }

  async function handleSave() {
    if (!promoEndDate) {
      setError('Promo end date is required');
      return;
    }
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
      resetForm();
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
      if (!res.ok) throw new Error();
      setPurchases((prev) => prev.filter((p) => p.id !== id));
    } catch {
      // stay in list on failure
    } finally {
      setDeletingId(null);
    }
  }

  const totalRequired = purchases.reduce((sum, p) => {
    return sum + (calcRequiredMonthly(p.purchaseAmount, p.promoEndDate) ?? 0);
  }, 0);

  return (
    <div className="space-y-4">
      {/* Existing purchases */}
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

      {/* Transaction picker */}
      {mode === 'pick-transaction' && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Select the purchase that&apos;s on promotional financing:</p>
          <div className="border rounded-md divide-y max-h-72 overflow-y-auto">
            {eligibleTransactions.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4">No posted transactions found.</p>
            ) : (
              eligibleTransactions.map((tx) => (
                <button
                  key={tx.transactionId}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-accent transition-colors text-left"
                  onClick={() => selectTransaction(tx)}
                >
                  <div>
                    <p className="font-medium">{tx.merchantName ?? tx.name}</p>
                    <p className="text-muted-foreground">{formatDate(tx.date)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono">{formatCurrency(tx.amount)}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </button>
              ))
            )}
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={resetForm}>Cancel</Button>
            <Button variant="ghost" size="sm" onClick={() => setMode('manual-form')}>
              Enter manually instead
            </Button>
          </div>
        </div>
      )}

      {/* Confirm selected transaction — just needs promo end date */}
      {mode === 'confirm-transaction' && selectedTx && (
        <div className="space-y-4 border rounded-md p-4">
          <div className="text-sm space-y-0.5">
            <p className="font-medium">{selectedTx.merchantName ?? selectedTx.name}</p>
            <p className="text-muted-foreground">{formatCurrency(selectedTx.amount)} · {formatDate(selectedTx.date)}</p>
          </div>
          <div className="space-y-2 max-w-xs">
            <Label htmlFor="tx-end-date">Promo end date</Label>
            <Input
              id="tx-end-date"
              type="date"
              required
              value={promoEndDate}
              onChange={(e) => setPromoEndDate(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="tx-deferred"
              type="checkbox"
              checked={isDeferredInterest}
              onChange={(e) => setIsDeferredInterest(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            <Label htmlFor="tx-deferred" className="cursor-pointer">Deferred interest</Label>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" disabled={saving} onClick={handleSave}>
              {saving ? 'Saving…' : 'Add purchase'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode('pick-transaction')}>Back</Button>
          </div>
        </div>
      )}

      {/* Manual form */}
      {mode === 'manual-form' && (
        <div className="space-y-4 border rounded-md p-4">
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
            <Button size="sm" disabled={saving} onClick={handleSave}>
              {saving ? 'Saving…' : 'Add purchase'}
            </Button>
            <Button size="sm" variant="ghost" onClick={resetForm}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Add buttons — only show when idle */}
      {mode === 'idle' && (
        <div className="flex gap-2 flex-wrap">
          {eligibleTransactions.length > 0 && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setMode('pick-transaction')}>
              <Plus className="h-3.5 w-3.5" />
              Pick from transactions
            </Button>
          )}
          <Button
            variant={eligibleTransactions.length > 0 ? 'ghost' : 'outline'}
            size="sm"
            className="gap-1.5"
            onClick={() => setMode('manual-form')}
          >
            <Plus className="h-3.5 w-3.5" />
            Add manually
          </Button>
        </div>
      )}
    </div>
  );
}
