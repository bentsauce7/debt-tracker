'use client';

import { useEffect, useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Result = { institution: string; statementsProcessed: number; errors: string[] };

const MAX_BATCHES = 20;

export function SyncStatementsButton() {
  const [loading, setLoading] = useState(false);
  const [batchCount, setBatchCount] = useState(0);
  const [aggProcessed, setAggProcessed] = useState(0);
  const [aggErrors, setAggErrors] = useState<{ institution: string; errors: string[] }[]>([]);
  const [done, setDone] = useState<boolean | null>(null);
  const [moreRemaining, setMoreRemaining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  async function handleClick() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setBatchCount(0);
    setAggProcessed(0);
    setAggErrors([]);
    setDone(null);
    setMoreRemaining(false);
    setError(null);

    let exhaustedBatches = true;
    try {
      for (let i = 0; i < MAX_BATCHES; i++) {
        const res = await fetch('/api/plaid/sync-statements', {
          method: 'POST',
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('Failed');
        const data: { results: Result[]; done: boolean } = await res.json();

        const batchProcessed = data.results.reduce((s, r) => s + r.statementsProcessed, 0);
        const batchErrors = data.results
          .filter((r) => r.errors.length > 0)
          .map((r) => ({ institution: r.institution, errors: r.errors }));

        setBatchCount((b) => b + 1);
        setAggProcessed((p) => p + batchProcessed);
        setAggErrors((e) => [...e, ...batchErrors]);

        if (data.done || batchProcessed === 0) {
          setDone(true);
          exhaustedBatches = false;
          break;
        }
      }
      if (exhaustedBatches) {
        setMoreRemaining(true);
      }
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return;
      setError('Failed to sync statements');
    } finally {
      setLoading(false);
    }
  }

  const totalErrors = aggErrors.reduce((s, r) => s + r.errors.length, 0);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Download and extract APR, promotional purchase, and balance data from statement PDFs using AI.
      </p>
      <Button variant="outline" className="gap-2" onClick={handleClick} disabled={loading}>
        <FileText className="h-4 w-4" />
        {loading
          ? `Processing… (${aggProcessed} done${batchCount > 0 ? `, batch ${batchCount}` : ''})`
          : moreRemaining
            ? 'Continue syncing'
            : 'Sync statements'}
      </Button>
      {(loading || done !== null || moreRemaining) && (
        <div className="text-sm space-y-1">
          <p className="text-green-700 dark:text-green-400">
            {aggProcessed} new statement{aggProcessed !== 1 ? 's' : ''} processed
            {totalErrors > 0 ? ` · ${totalErrors} error${totalErrors !== 1 ? 's' : ''}` : ''}
            {done === true ? ' · complete' : ''}
            {moreRemaining ? ' · more available, click to continue' : ''}
          </p>
          {aggErrors.map((r, idx) => (
            <div key={`${r.institution}-${idx}`}>
              {r.errors.map((e, i) => (
                <p key={i} className="text-destructive text-xs">{r.institution}: {e}</p>
              ))}
            </div>
          ))}
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
