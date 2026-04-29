import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/db';
import { accounts, plaidItems, mxMembers, promoPurchases } from '@/db/schema';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const [purchase] = await db
    .select({ accountId: promoPurchases.accountId })
    .from(promoPurchases)
    .where(eq(promoPurchases.id, id))
    .limit(1);

  if (!purchase) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [account] = await db
    .select({ plaidUserId: plaidItems.userId, mxUserId: mxMembers.userId })
    .from(accounts)
    .leftJoin(plaidItems, eq(plaidItems.id, accounts.itemId))
    .leftJoin(mxMembers, eq(mxMembers.id, accounts.mxMemberId))
    .where(eq(accounts.accountId, purchase.accountId))
    .limit(1);

  if (!account || (account.plaidUserId !== userId && account.mxUserId !== userId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await db.delete(promoPurchases).where(eq(promoPurchases.id, id));
  return NextResponse.json({ success: true });
}
