import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { plaidItems } from '@/db/schema';
import { plaidClient } from '@/lib/plaid';
import { decrypt } from '@/lib/crypto';

export async function DELETE(_req: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;

  const [item] = await db.select().from(plaidItems).where(eq(plaidItems.id, itemId));
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
