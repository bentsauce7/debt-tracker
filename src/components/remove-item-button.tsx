'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';

export function RemoveItemButton({ itemId, apiPath, institutionName }: { itemId: string; apiPath?: string; institutionName: string }) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleRemove() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiPath ?? `/api/plaid/items/${itemId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to remove institution');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLoading(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Remove {institutionName}?</span>
        <Button variant="destructive" size="sm" onClick={handleRemove} disabled={loading}>
          {loading ? 'Removing…' : 'Yes, remove'}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={loading}>
          Cancel
        </Button>
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>
    );
  }

  return (
    <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => setConfirming(true)}>
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}
