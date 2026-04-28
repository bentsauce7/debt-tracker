import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { plaidClient } from '@/lib/plaid';
import { encrypt } from '@/lib/crypto';
import { db } from '@/db';
import { plaidItems } from '@/db/schema';

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { public_token, institution } = await request.json();

    if (!public_token) {
      return NextResponse.json({ error: 'Missing public_token' }, { status: 400 });
    }

    const { data } = await plaidClient.itemPublicTokenExchange({ public_token });

    const encryptedToken = encrypt(data.access_token);

    await db
      .insert(plaidItems)
      .values({
        userId,
        itemId: data.item_id,
        accessToken: encryptedToken,
        institutionName: institution?.name ?? null,
        institutionId: institution?.institution_id ?? null,
      })
      .onConflictDoUpdate({
        target: plaidItems.itemId,
        set: {
          userId,
          accessToken: encryptedToken,
          institutionName: institution?.name ?? null,
          institutionId: institution?.institution_id ?? null,
          needsReauth: false,
          updatedAt: new Date(),
        },
      });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('exchange error:', err);
    return NextResponse.json({ error: 'Failed to exchange token' }, { status: 500 });
  }
}
