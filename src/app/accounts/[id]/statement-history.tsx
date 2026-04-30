import { formatCurrency, formatDate } from '@/lib/utils';

type Statement = {
  statementDate: string;
  closingBalance: string | null;
  minimumPayment: string | null;
  paymentDueDate: string | null;
};

export function StatementHistory({ statements }: { statements: Statement[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="text-left font-medium pb-2">Statement Date</th>
            <th className="text-right font-medium pb-2">Closing Balance</th>
            <th className="text-right font-medium pb-2">Min Payment</th>
            <th className="text-right font-medium pb-2">Due Date</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {statements.map((s) => (
            <tr key={s.statementDate} className="py-2">
              <td className="py-2">{formatDate(s.statementDate)}</td>
              <td className="py-2 text-right font-mono">{s.closingBalance ? formatCurrency(s.closingBalance) : '—'}</td>
              <td className="py-2 text-right font-mono">{s.minimumPayment ? formatCurrency(s.minimumPayment) : '—'}</td>
              <td className="py-2 text-right">{s.paymentDueDate ? formatDate(s.paymentDueDate) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
