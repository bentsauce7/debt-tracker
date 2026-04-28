import { desc } from 'drizzle-orm';
import { db } from '@/db';
import { syncLog, plaidItems, mxMembers } from '@/db/schema';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SyncButton } from '@/components/sync-button';
import { formatDate } from '@/lib/utils';
import { AlertTriangle } from 'lucide-react';

export default async function SyncPage() {
  const [logs, plaid, mx] = await Promise.all([
    db.select().from(syncLog).orderBy(desc(syncLog.startedAt)).limit(10),
    db.select().from(plaidItems),
    db.select().from(mxMembers),
  ]);

  const reauthPlaid = plaid.filter((i) => i.needsReauth);
  const reauthMx = mx.filter((m) => m.needsReauth);
  const hasReauth = reauthPlaid.length > 0 || reauthMx.length > 0;
  const allItems = [...plaid, ...mx];

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Sync</h1>
        <p className="text-muted-foreground mt-1">
          Pull the latest balances from all connected institutions.
        </p>
      </div>

      {hasReauth && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-destructive">Reauthorization needed</p>
            <p className="text-sm text-destructive/80 mt-0.5">
              The following institutions need you to reconnect:{' '}
              {[
                ...reauthPlaid.map((i) => i.institutionName ?? i.itemId),
                ...reauthMx.map((m) => m.institutionName ?? m.memberGuid),
              ].join(', ')}.
            </p>
            <p className="text-sm text-destructive/80 mt-1">
              Go to <a href="/connect" className="underline">Connect</a> to re-link them.
            </p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Connected Institutions</CardTitle>
        </CardHeader>
        <CardContent>
          {allItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No institutions connected.{' '}
              <a href="/connect" className="underline">Connect one</a> first.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {plaid.map((item) => (
                <li key={item.id} className="flex items-center justify-between">
                  <span>
                    {item.institutionName ?? item.itemId}
                    <span className="ml-2 text-xs text-muted-foreground">Plaid</span>
                  </span>
                  {item.needsReauth ? (
                    <Badge variant="destructive">Needs reauth</Badge>
                  ) : (
                    <Badge variant="success">Connected</Badge>
                  )}
                </li>
              ))}
              {mx.map((member) => (
                <li key={member.id} className="flex items-center justify-between">
                  <span>
                    {member.institutionName ?? member.memberGuid}
                    <span className="ml-2 text-xs text-muted-foreground">MX</span>
                  </span>
                  {member.needsReauth ? (
                    <Badge variant="destructive">Needs reauth</Badge>
                  ) : (
                    <Badge variant="success">Connected</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Run a Sync</CardTitle>
        </CardHeader>
        <CardContent>
          <SyncButton />
        </CardContent>
      </Card>

      {logs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Sync History</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm">
              {logs.map((log) => {
                const errors = (log.errors as string[]) ?? [];
                return (
                  <li key={log.id} className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-medium">{formatDate(log.startedAt)}</div>
                      <div className="text-muted-foreground">
                        {log.itemsSynced} item{log.itemsSynced !== 1 ? 's' : ''} · {log.accountsUpdated} accounts
                      </div>
                      {errors.length > 0 && (
                        <ul className="text-destructive mt-1 space-y-0.5">
                          {errors.map((e, i) => <li key={i}>{e}</li>)}
                        </ul>
                      )}
                    </div>
                    <Badge variant={log.status === 'completed' ? 'success' : log.status === 'failed' ? 'destructive' : 'secondary'}>
                      {log.status}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
