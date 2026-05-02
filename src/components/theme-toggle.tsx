'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Monitor, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

const order = ['system', 'light', 'dark'] as const;
type Mode = (typeof order)[number];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <Button variant="ghost" size="icon" className="h-9 w-9" disabled aria-label="Theme" />;
  }

  const current = (order.includes(theme as Mode) ? theme : 'system') as Mode;
  const next = order[(order.indexOf(current) + 1) % order.length];
  const Icon = current === 'light' ? Sun : current === 'dark' ? Moon : Monitor;

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-9 w-9"
      onClick={() => setTheme(next)}
      aria-label={`Theme: ${current}, switch to ${next}`}
      title={`Theme: ${current}`}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}
