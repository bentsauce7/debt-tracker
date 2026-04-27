'use client';

import { useCallback, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Link2 } from 'lucide-react';

interface PlaidLinkButtonProps {
  linkToken: string;
}

export function PlaidLinkButton({ linkToken }: PlaidLinkButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const onSuccess = useCallback(
    async (publicToken: string, metadata: { institution?: { name: string; institution_id: string } | null }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/plaid/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            public_token: publicToken,
            institution: metadata.institution,
          }),
        });

        if (!res.ok) throw new Error('Failed to connect institution');

        router.push('/sync');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong');
        setLoading(false);
      }
    },
    [router],
  );

  const { open, ready } = usePlaidLink({ token: linkToken, onSuccess });

  return (
    <div className="space-y-3">
      <Button onClick={() => open()} disabled={!ready || loading} size="lg" className="gap-2">
        <Link2 className="h-4 w-4" />
        {loading ? 'Connecting…' : 'Connect Institution'}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
