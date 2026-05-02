'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function PlaidUpdateButton({ itemId, label = 'Enable transactions' }: { itemId: string; label?: string }) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSuccess = useCallback(async () => {
    setLoading(true);
    try {
      await fetch('/api/plaid/sync', { method: 'POST' });
      setDone(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const onExit = useCallback((err: { error_code?: string; error_message?: string; display_message?: string } | null) => {
    if (err) {
      console.error('Plaid Link exit error:', err);
      setError(
        err.display_message ||
          err.error_message ||
          err.error_code ||
          'Plaid Link closed with an error',
      );
    }
    setLinkToken(null);
    setLoading(false);
  }, []);

  const onEvent = useCallback((eventName: string, metadata: unknown) => {
    if (eventName === 'ERROR' || eventName === 'EXIT' || eventName === 'HANDOFF') {
      console.log('Plaid event:', eventName, metadata);
    }
  }, []);

  const { open, ready } = usePlaidLink({
    token: linkToken ?? '',
    onSuccess,
    onExit,
    onEvent,
  });

  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/plaid/update-link-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail?.error_message ?? body.error ?? 'Failed to get update token');
      setLinkToken(body.link_token);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start update');
    } finally {
      setLoading(false);
    }
  }

  if (done) return <span className="text-xs text-green-700">Updated — sync complete</span>;

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" className="gap-1.5" onClick={handleClick} disabled={loading}>
        <RefreshCw className="h-3.5 w-3.5" />
        {loading ? 'Loading…' : label}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
