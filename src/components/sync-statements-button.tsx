'use client';

import { useState } from 'react';
import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Result = { institution: string; statementsProcessed: number; errors: string[] };

export function SyncStatementsButton() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setResults(null);
    setError(null);
    try {
      const res = await fetch('/api/plaid/sync-statements', { method: 'POST' });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setResults(data.results);
    } catch {
      setError('Failed to sync statements');
    } finally {
      setLoading(false);
    }
  }

  const totalProcessed = results?.reduce((s, r) => s + r.statementsProcessed, 0) ?? 0;
  const totalErrors = results?.reduce((s, r) => s + r.errors.length, 0) ?? 0;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Download and extract APR, promotional purchase, and balance data from statement PDFs using AI.
      </p>
      <Button variant="outline" className="gap-2" onClick={handleClick} disabled={loading}>
        <FileText className="h-4 w-4" />
        {loading ? 'Processing statements…' : 'Sync statements'}
      </Button>
      {results && (
        <div className="text-sm space-y-1">
          <p className="text-green-700">
            {totalProcessed} new statement{totalProcessed !== 1 ? 's' : ''} processed
            {totalErrors > 0 ? ` · ${totalErrors} error${totalErrors !== 1 ? 's' : ''}` : ''}
          </p>
          {results.filter((r) => r.errors.length > 0).map((r) => (
            <div key={r.institution}>
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
