import { desc, eq } from 'drizzle-orm';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/db';
import { syncLog, plaidItems, mxMembers } from '@/db/schema';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SyncButton } from '@/components/sync-button';
import { RegisterWebhooksButton } from '@/components/register-webhooks-button';
import { PlaidUpdateButton } from '@/components/plaid-update-button';
import { formatDate } from '@/lib/utils';
import { AlertTriangle } from 'lucide-react';

export default async function SyncPage() {
  const { userId } = await auth();
  const [logs, plaid, mx] = await Promise.all([
    db.select().from(syncLog).where(eq(syncLog.userId, userId!)).orderBy(desc(syncLog.startedAt)).limit(10),
    db.select().from(plaidItems).where(eq(plaidItems.userId, userId!)),
    db.select().from(mxMembers).where(eq(mxMembers.userId, userId!)),
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
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
            <p className="font-medium text-destructive">Reauthorization needed</p>
          </div>
          <div className="space-y-2 pl-8">
            {reauthPlaid.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-4">
                <span className="text-sm text-destructive/80">{item.institutionName ?? item.itemId}</span>
                <PlaidUpdateButton itemId={item.id} label="Reconnect" />
              </div>
            ))}
            {reauthMx.length > 0 && (
              <p className="text-sm text-destructive/80">
                {reauthMx.map((m) => m.institutionName ?? m.memberGuid).join(', ')} —{' '}
                <a href="/connect" className="underline">reconnect via Connect page</a>
              </p>
            )}
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
                <li key={item.id} className="flex items-center justify-between gap-4">
                  <span>
                    {item.institutionName ?? item.itemId}
                    <span className="ml-2 text-xs text-muted-foreground">Plaid</span>
                  </span>
                  {item.needsReauth ? (
                    <PlaidUpdateButton itemId={item.id} label="Reconnect" />
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

      {plaid.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Webhooks</CardTitle>
          </CardHeader>
          <CardContent>
            <RegisterWebhooksButton />
          </CardContent>
        </Card>
      )}

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
