import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/db';
import { accounts, plaidItems, mxMembers, promoPurchases } from '@/db/schema';

async function verifyAccountOwnership(accountId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ plaidUserId: plaidItems.userId, mxUserId: mxMembers.userId })
    .from(accounts)
    .leftJoin(plaidItems, eq(plaidItems.id, accounts.itemId))
    .leftJoin(mxMembers, eq(mxMembers.id, accounts.mxMemberId))
    .where(eq(accounts.accountId, accountId))
    .limit(1);
  if (!row) return false;
  return row.plaidUserId === userId || row.mxUserId === userId;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { accountId } = await params;
  if (!(await verifyAccountOwnership(accountId, userId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { description, purchaseAmount, purchaseDate, promoEndDate, isDeferredInterest } =
    await request.json();

  if (!purchaseAmount || !promoEndDate) {
    return NextResponse.json({ error: 'purchaseAmount and promoEndDate are required' }, { status: 400 });
  }

  const [created] = await db
    .insert(promoPurchases)
    .values({
      accountId,
      description: description || null,
      purchaseAmount: purchaseAmount.toString(),
      purchaseDate: purchaseDate || null,
      promoEndDate,
      isDeferredInterest: isDeferredInterest ?? false,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
