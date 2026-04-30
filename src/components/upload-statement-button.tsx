'use client';

import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils';

export function UploadStatementButton({ accountId, onUploaded }: { accountId: string; onUploaded?: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const form = new FormData();
      form.append('pdf', file);
      const res = await fetch(`/api/accounts/${accountId}/upload-statement`, {
        method: 'POST',
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Upload failed (${res.status})`);
      setResult(`Processed — statement date ${formatDate(data.statementDate)}`);
      onUploaded?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        disabled={loading}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="h-4 w-4" />
        {loading ? 'Processing…' : 'Upload statement PDF'}
      </Button>
      {result && <p className="text-sm text-green-700">{result}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
