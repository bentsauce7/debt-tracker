import { NextResponse } from 'next/server';
import { plaidClient } from '@/lib/plaid';
import { Products, CountryCode } from 'plaid';

export async function POST() {
  try {
    const { data } = await plaidClient.linkTokenCreate({
      user: { client_user_id: 'shared-household' },
      client_name: 'Debt Tracker',
      products: [Products.Liabilities],
      country_codes: [CountryCode.Us],
      language: 'en',
    });

    return NextResponse.json({ link_token: data.link_token });
  } catch (err) {
    console.error('link-token error:', err);
    return NextResponse.json({ error: 'Failed to create link token' }, { status: 500 });
  }
}
