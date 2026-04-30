import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { plaidClient } from '@/lib/plaid';
import { Products, CountryCode } from 'plaid';

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { data } = await plaidClient.linkTokenCreate({
      user: { client_user_id: userId },
      client_name: 'Debt Tracker',
      products: [Products.Liabilities],
      country_codes: [CountryCode.Us],
      language: 'en',
      redirect_uri: process.env.PLAID_OAUTH_REDIRECT_URI,
      webhook: `${process.env.NEXT_PUBLIC_APP_URL}/api/plaid/webhook`,
    });

    return NextResponse.json({ link_token: data.link_token });
  } catch (err) {
    console.error('link-token error:', err);
    return NextResponse.json({ error: 'Failed to create link token' }, { status: 500 });
  }
}
