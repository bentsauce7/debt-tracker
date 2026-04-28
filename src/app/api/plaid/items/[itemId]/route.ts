import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/db';
import { plaidItems } from '@/db/schema';
import { plaidClient } from '@/lib/plaid';
import { decrypt } from '@/lib/crypto';

export async function DELETE(_req: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { itemId } = await params;

  const [item] = await db
    .select()
    .from(plaidItems)
    .where(and(eq(plaidItems.id, itemId), eq(plaidItems.userId, userId)));
  if (!item) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  try {
    const accessToken = decrypt(item.accessToken);
    await plaidClient.itemRemove({ access_token: accessToken });
  } catch {
    // Proceed with DB deletion even if Plaid revocation fails (token may already be invalid)
  }

  await db.delete(plaidItems).where(eq(plaidItems.id, itemId));

  return NextResponse.json({ success: true });
}
