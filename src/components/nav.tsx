'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';
import { cn } from '@/lib/utils';
import { CreditCard, LayoutDashboard, Link2, RefreshCw, TrendingDown } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';

const links = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/accounts', label: 'Accounts', icon: CreditCard },
  { href: '/connect', label: 'Connect', icon: Link2 },
  { href: '/sync', label: 'Sync', icon: RefreshCw },
  { href: '/scenarios', label: 'Scenarios', icon: TrendingDown },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="border-b bg-background">
      <div className="container flex h-14 items-center justify-between">
        <div className="flex items-center gap-1">
          <span className="hidden sm:inline mr-4 font-semibold text-sm">Debt Tracker</span>
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground',
                pathname === href ? 'bg-accent text-accent-foreground' : 'text-muted-foreground',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <UserButton />
        </div>
      </div>
    </nav>
  );
}
