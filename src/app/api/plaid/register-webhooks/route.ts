import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/db';
import { plaidItems } from '@/db/schema';
import { plaidClient } from '@/lib/plaid';
import { decrypt } from '@/lib/crypto';

const WEBHOOK_URL = `${process.env.NEXT_PUBLIC_APP_URL}/api/plaid/webhook`;

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const items = await db.select().from(plaidItems).where(eq(plaidItems.userId, userId));

  const results = await Promise.allSettled(
    items.map(async (item) => {
      const accessToken = decrypt(item.accessToken);
      await plaidClient.itemWebhookUpdate({ access_token: accessToken, webhook: WEBHOOK_URL });
      return item.institutionName ?? item.itemId;
    }),
  );

  const updated = results
    .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
    .map((r) => r.value);
  const failed = results.filter((r) => r.status === 'rejected').length;

  return NextResponse.json({ updated, failed });
}
