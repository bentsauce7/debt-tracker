import { Products, CountryCode } from 'plaid';
import { eq, count } from 'drizzle-orm';
import { auth } from '@clerk/nextjs/server';
import { plaidClient } from '@/lib/plaid';
import { db } from '@/db';
import { plaidItems, mxMembers, accounts } from '@/db/schema';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PlaidLinkButton } from '@/components/plaid-link-button';
import { PlaidUpdateButton } from '@/components/plaid-update-button';
import { MxConnectButton } from '@/components/mx-connect-button';
import { RemoveItemButton } from '@/components/remove-item-button';
import { AlertTriangle, Building2 } from 'lucide-react';

async function getLinkToken(): Promise<string | null> {
  try {
    const { data } = await plaidClient.linkTokenCreate({
      user: { client_user_id: 'shared-household' },
      client_name: 'Debt Tracker',
      products: [Products.Liabilities],
      country_codes: [CountryCode.Us],
      language: 'en',
      redirect_uri: process.env.PLAID_OAUTH_REDIRECT_URI,
      webhook: `${process.env.NEXT_PUBLIC_APP_URL}/api/plaid/webhook`,
    });
    return data.link_token;
  } catch {
    return null;
  }
}

async function getConnectedItems(userId: string) {
  const [plaidRows, mxRows, plaidCounts, mxCounts] = await Promise.all([
    db.select().from(plaidItems).where(eq(plaidItems.userId, userId)).orderBy(plaidItems.createdAt),
    db.select().from(mxMembers).where(eq(mxMembers.userId, userId)).orderBy(mxMembers.createdAt),
    db
      .select({ itemId: accounts.itemId, count: count() })
      .from(accounts)
      .where(eq(accounts.type, 'credit'))
      .groupBy(accounts.itemId),
    db
      .select({ mxMemberId: accounts.mxMemberId, count: count() })
      .from(accounts)
      .where(eq(accounts.type, 'credit'))
      .groupBy(accounts.mxMemberId),
  ]);

  const plaidCountMap = new Map(plaidCounts.map((c) => [c.itemId, c.count]));
  const mxCountMap = new Map(mxCounts.map((c) => [c.mxMemberId, c.count]));

  return {
    plaid: plaidRows.map((item) => ({ ...item, accountCount: plaidCountMap.get(item.id) ?? 0 })),
    mx: mxRows.map((member) => ({ ...member, accountCount: mxCountMap.get(member.id) ?? 0 })),
  };
}

export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ oauth_state_id?: string }>;
}) {
  const params = await searchParams;
  const { userId } = await auth();
  const [linkToken, { plaid, mx }] = await Promise.all([getLinkToken(), getConnectedItems(userId!)]);

  const receivedRedirectUri =
    params.oauth_state_id && process.env.PLAID_OAUTH_REDIRECT_URI
      ? `${process.env.PLAID_OAUTH_REDIRECT_URI}?oauth_state_id=${params.oauth_state_id}`
      : undefined;
  const allConnected = [...plaid, ...mx];

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Connect Institution</h1>
        <p className="text-muted-foreground mt-1">
          Add a bank or credit card issuer to track its accounts.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Link via Plaid</CardTitle>
            <CardDescription>
              For most major banks and credit card issuers.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {linkToken ? (
              <PlaidLinkButton linkToken={linkToken} receivedRedirectUri={receivedRedirectUri} />
            ) : (
              <div className="flex items-start gap-2 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>Could not create a Plaid link token. Check your Plaid env vars.</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Link via MX</CardTitle>
            <CardDescription>
              For institutions not available in Plaid.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MxConnectButton />
          </CardContent>
        </Card>
      </div>

      {allConnected.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Connected Institutions
          </h2>
          <div className="space-y-2">
            {plaid.map((item) => (
              <div key={item.id} className="rounded-lg border px-4 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-sm font-medium">
                        {item.institutionName ?? 'Unknown institution'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Plaid · {item.accountCount} credit account{item.accountCount !== 1 ? 's' : ''}
                        {item.needsReauth && <span className="ml-2 text-destructive">· needs reauth</span>}
                      </p>
                    </div>
                  </div>
                  <RemoveItemButton
                    itemId={item.id}
                    apiPath={`/api/plaid/items/${item.id}`}
                    institutionName={item.institutionName ?? 'this institution'}
                  />
                </div>
                <PlaidUpdateButton itemId={item.id} />
              </div>
            ))}
            {mx.map((member) => (
              <div key={member.id} className="flex items-center justify-between rounded-lg border px-4 py-3">
                <div className="flex items-center gap-3">
                  <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-sm font-medium">
                      {member.institutionName ?? 'Unknown institution'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      MX · {member.accountCount} credit account{member.accountCount !== 1 ? 's' : ''}
                      {member.needsReauth && <span className="ml-2 text-destructive">· needs reauth</span>}
                    </p>
                  </div>
                </div>
                <RemoveItemButton
                  itemId={member.id}
                  apiPath={`/api/mx/members/${member.id}`}
                  institutionName={member.institutionName ?? 'this institution'}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        After connecting, go to the{' '}
        <a href="/sync" className="underline">Sync page</a>{' '}
        to pull the latest balances.
      </p>
    </div>
  );
}
