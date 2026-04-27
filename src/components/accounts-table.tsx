'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatPercent, formatDate, calcUtilization } from '@/lib/utils';
import { ArrowUpDown } from 'lucide-react';

type AccountRow = {
  accountId: string;
  name: string;
  mask: string | null;
  officialName: string | null;
  type: string;
  subtype: string | null;
  currentBalance: string | null;
  creditLimit: string | null;
  isOverdue: boolean | null;
  institutionName: string | null;
  minimumPaymentAmount: string | null;
  nextPaymentDueDate: string | null;
  purchaseApr: string | null;
};

type SortKey = 'name' | 'balance' | 'utilization' | 'apr' | 'minPayment' | 'dueDate';
type SortDir = 'asc' | 'desc';

function getSortValue(row: AccountRow, key: SortKey): number | string {
  switch (key) {
    case 'name': return row.name;
    case 'balance': return parseFloat(row.currentBalance ?? '0');
    case 'utilization': return calcUtilization(row.currentBalance, row.creditLimit) ?? -1;
    case 'apr': return parseFloat(row.purchaseApr ?? '0');
    case 'minPayment': return parseFloat(row.minimumPaymentAmount ?? '0');
    case 'dueDate': return row.nextPaymentDueDate ?? '';
    default: return '';
  }
}

export function AccountsTable({ rows }: { rows: AccountRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('balance');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const sorted = [...rows].sort((a, b) => {
    const av = getSortValue(a, sortKey);
    const bv = getSortValue(b, sortKey);
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === 'asc' ? cmp : -cmp;
  });

  function SortButton({ col, label }: { col: SortKey; label: string }) {
    return (
      <Button variant="ghost" size="sm" className="-ml-3 h-8 gap-1" onClick={() => toggleSort(col)}>
        {label}
        <ArrowUpDown className="h-3 w-3" />
      </Button>
    );
  }

  const today = new Date().toISOString().split('T')[0];

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead><SortButton col="name" label="Account" /></TableHead>
          <TableHead><SortButton col="balance" label="Balance" /></TableHead>
          <TableHead>Limit</TableHead>
          <TableHead><SortButton col="utilization" label="Util %" /></TableHead>
          <TableHead><SortButton col="apr" label="APR" /></TableHead>
          <TableHead><SortButton col="minPayment" label="Min Payment" /></TableHead>
          <TableHead><SortButton col="dueDate" label="Due Date" /></TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((row) => {
          const util = calcUtilization(row.currentBalance, row.creditLimit);
          const isPastDue = row.nextPaymentDueDate && row.nextPaymentDueDate < today;
          const isOverLimit = util !== null && util > 100;

          return (
            <TableRow key={row.accountId}>
              <TableCell>
                <Link href={`/accounts/${row.accountId}`} className="font-medium hover:underline">
                  {row.institutionName ? `${row.institutionName} ` : ''}{row.name}
                  {row.mask && <span className="text-muted-foreground ml-1">···{row.mask}</span>}
                </Link>
                <div className="text-xs text-muted-foreground capitalize">{row.subtype ?? row.type}</div>
              </TableCell>
              <TableCell className="font-mono">{formatCurrency(row.currentBalance)}</TableCell>
              <TableCell className="font-mono text-muted-foreground">
                {row.creditLimit ? formatCurrency(row.creditLimit) : '—'}
              </TableCell>
              <TableCell>
                {util !== null ? (
                  <span className={util > 90 ? 'text-destructive font-medium' : util > 70 ? 'text-yellow-600' : ''}>
                    {formatPercent(util)}
                  </span>
                ) : '—'}
              </TableCell>
              <TableCell className="font-mono">
                {row.purchaseApr ? formatPercent(row.purchaseApr) : '—'}
              </TableCell>
              <TableCell className="font-mono">
                {row.minimumPaymentAmount ? formatCurrency(row.minimumPaymentAmount) : '—'}
              </TableCell>
              <TableCell className={isPastDue ? 'text-destructive font-medium' : ''}>
                {formatDate(row.nextPaymentDueDate)}
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {isPastDue && <Badge variant="destructive">Past Due</Badge>}
                  {isOverLimit && <Badge variant="destructive">Over Limit</Badge>}
                  {row.isOverdue && !isPastDue && <Badge variant="warning">Overdue</Badge>}
                  {!isPastDue && !isOverLimit && !row.isOverdue && (
                    <Badge variant="success">OK</Badge>
                  )}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
        {sorted.length === 0 && (
          <TableRow>
            <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
              No accounts yet. Connect an institution to get started.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
