import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth } from '@clerk/nextjs/server';
import { CountryCode, Products } from 'plaid';
import { db } from '@/db';
import { plaidItems } from '@/db/schema';
import { plaidClient } from '@/lib/plaid';
import { decrypt } from '@/lib/crypto';

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { itemId } = await request.json();

  const [item] = await db
    .select()
    .from(plaidItems)
    .where(eq(plaidItems.id, itemId))
    .limit(1);

  if (!item || item.userId !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const accessToken = decrypt(item.accessToken);
    const { data } = await plaidClient.linkTokenCreate({
      user: { client_user_id: userId },
      client_name: 'Debt Tracker',
      access_token: accessToken,
      additional_consented_products: [Products.Statements],
      country_codes: [CountryCode.Us],
      language: 'en',
      redirect_uri: process.env.PLAID_OAUTH_REDIRECT_URI,
    });
    return NextResponse.json({ link_token: data.link_token });
  } catch (err) {
    console.error('update-link-token error:', err);
    return NextResponse.json({ error: 'Failed to create update token' }, { status: 500 });
  }
}
