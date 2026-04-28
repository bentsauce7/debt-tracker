'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Link2, X } from 'lucide-react';

export function MxConnectButton() {
  const [widgetUrl, setWidgetUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const openWidget = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/mx/widget-url');
      if (!res.ok) throw new Error('Could not load MX widget');
      const { url } = await res.json();
      setWidgetUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleMessage = useCallback(
    async (event: MessageEvent) => {
      const payload = event.data?.mx ?? event.data;
      if (!payload?.type?.startsWith('mx/connect/')) return;

      if (payload.type === 'mx/connect/memberConnected') {
        const { member_guid, user_guid } = payload.metadata ?? {};
        if (!member_guid || !user_guid) return;

        setWidgetUrl(null);
        setLoading(true);
        try {
          const res = await fetch('/api/mx/exchange', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ member_guid, user_guid }),
          });
          if (!res.ok) throw new Error('Failed to save institution');
          router.push('/sync');
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Something went wrong');
          setLoading(false);
        }
      }

      if (payload.type === 'mx/connect/closed') {
        setWidgetUrl(null);
      }
    },
    [router],
  );

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  return (
    <>
      <div className="space-y-3">
        <Button
          onClick={openWidget}
          disabled={loading}
          size="lg"
          variant="outline"
          className="gap-2"
        >
          <Link2 className="h-4 w-4" />
          {loading ? 'Loading…' : 'Connect via MX'}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {widgetUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="relative w-full max-w-lg h-[600px] bg-white rounded-xl overflow-hidden shadow-2xl">
            <button
              onClick={() => setWidgetUrl(null)}
              className="absolute top-3 right-3 z-10 rounded-full bg-white/80 p-1 hover:bg-white"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
            <iframe
              src={widgetUrl}
              className="w-full h-full border-0"
              title="MX Connect"
            />
          </div>
        </div>
      )}
    </>
  );
}
