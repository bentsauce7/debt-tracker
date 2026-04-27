import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { TrendingDown } from 'lucide-react';

export default function ScenariosPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
      <TrendingDown className="h-12 w-12 text-muted-foreground" />
      <h1 className="text-3xl font-bold tracking-tight">Payoff Scenarios</h1>
      <p className="text-muted-foreground max-w-md">
        Avalanche and snowball payoff calculators are coming soon. You&apos;ll be able to model
        accelerated payoff timelines, compare strategies, and project interest saved.
      </p>
      <Button asChild variant="outline">
        <Link href="/">Back to Dashboard</Link>
      </Button>
    </div>
  );
}
