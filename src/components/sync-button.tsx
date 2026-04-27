'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { RefreshCw, CheckCircle2, XCircle } from 'lucide-react';

type SyncResult = {
  itemsSynced: number;
  accountsUpdated: number;
  errors: string[];
};

export function SyncButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function runSync() {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch('/api/plaid/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Sync failed');
      setResult(data);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Button onClick={runSync} disabled={loading} size="lg" className="gap-2">
        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        {loading ? 'Syncing…' : 'Sync Now'}
      </Button>

      {result && (
        <div className="rounded-lg border p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-green-700">
            <CheckCircle2 className="h-4 w-4" />
            Sync complete
          </div>
          <p className="text-sm text-muted-foreground">
            {result.itemsSynced} institution{result.itemsSynced !== 1 ? 's' : ''} synced,{' '}
            {result.accountsUpdated} account{result.accountsUpdated !== 1 ? 's' : ''} updated.
          </p>
          {result.errors.length > 0 && (
            <ul className="text-sm text-destructive space-y-1">
              {result.errors.map((e, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  {e}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive flex items-center gap-1.5">
          <XCircle className="h-4 w-4" />
          {error}
        </p>
      )}
    </div>
  );
}
