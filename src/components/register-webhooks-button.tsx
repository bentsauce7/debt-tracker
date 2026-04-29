'use client';

import { useState } from 'react';
import { Webhook } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function RegisterWebhooksButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ updated: string[]; failed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch('/api/plaid/register-webhooks', { method: 'POST' });
      if (!res.ok) throw new Error('Failed');
      setResult(await res.json());
    } catch {
      setError('Failed to register webhooks');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Register the webhook URL on all connected Plaid institutions so balance and transaction updates arrive automatically.
      </p>
      <Button variant="outline" className="gap-2" onClick={handleClick} disabled={loading}>
        <Webhook className="h-4 w-4" />
        {loading ? 'Registering…' : 'Register webhooks'}
      </Button>
      {result && (
        <p className="text-sm text-green-700">
          Registered on {result.updated.length} institution{result.updated.length !== 1 ? 's' : ''}
          {result.failed > 0 ? ` · ${result.failed} failed` : ''}.
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
