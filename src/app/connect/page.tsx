import { Products, CountryCode } from 'plaid';
import { plaidClient } from '@/lib/plaid';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PlaidLinkButton } from '@/components/plaid-link-button';
import { AlertTriangle } from 'lucide-react';

async function getLinkToken(): Promise<string | null> {
  try {
    const { data } = await plaidClient.linkTokenCreate({
      user: { client_user_id: 'shared-household' },
      client_name: 'Debt Tracker',
      products: [Products.Liabilities],
      country_codes: [CountryCode.Us],
      language: 'en',
    });
    return data.link_token;
  } catch {
    return null;
  }
}

export default async function ConnectPage() {
  const linkToken = await getLinkToken();

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Connect Institution</h1>
        <p className="text-muted-foreground mt-1">
          Add a bank or credit card issuer to track its accounts.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Link via Plaid</CardTitle>
          <CardDescription>
            Plaid will open a secure popup where you can search for your institution and
            log in with your online banking credentials. Only liability and account data
            is pulled — no transaction data is stored.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {linkToken ? (
            <PlaidLinkButton linkToken={linkToken} />
          ) : (
            <div className="flex items-start gap-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                Could not create a Plaid link token. Check that{' '}
                <code className="font-mono text-xs">PLAID_CLIENT_ID</code>,{' '}
                <code className="font-mono text-xs">PLAID_SECRET</code>, and{' '}
                <code className="font-mono text-xs">PLAID_ENV</code> are set correctly.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        After connecting, go to the{' '}
        <a href="/sync" className="underline">
          Sync page
        </a>{' '}
        to pull the latest balances and liabilities.
      </p>
    </div>
  );
}
