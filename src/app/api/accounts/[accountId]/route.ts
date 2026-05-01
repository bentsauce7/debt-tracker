import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/db';
import { accounts, manualOverrides, plaidItems, mxMembers } from '@/db/schema';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { accountId } = await params;

  const [owner] = await db
    .select({ plaidUserId: plaidItems.userId, mxUserId: mxMembers.userId })
    .from(accounts)
    .leftJoin(plaidItems, eq(plaidItems.id, accounts.itemId))
    .leftJoin(mxMembers, eq(mxMembers.id, accounts.mxMemberId))
    .where(eq(accounts.accountId, accountId))
    .limit(1);

  if (!owner || (owner.plaidUserId !== userId && owner.mxUserId !== userId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = await request.json();

  const { promoExpirationDate, isDeferredInterest, promoAprPercentage, promoBalance, accruedDeferredInterest, notes } = body;

  await db
    .insert(manualOverrides)
    .values({
      accountId,
      promoExpirationDate: promoExpirationDate ?? null,
      isDeferredInterest: isDeferredInterest ?? false,
      promoAprPercentage: promoAprPercentage?.toString() ?? null,
      promoBalance: promoBalance?.toString() ?? null,
      accruedDeferredInterest: accruedDeferredInterest?.toString() ?? null,
      notes: notes ?? null,
    })
    .onConflictDoUpdate({
      target: manualOverrides.accountId,
      set: {
        promoExpirationDate: promoExpirationDate ?? null,
        isDeferredInterest: isDeferredInterest ?? false,
        promoAprPercentage: promoAprPercentage?.toString() ?? null,
        promoBalance: promoBalance?.toString() ?? null,
        accruedDeferredInterest: accruedDeferredInterest?.toString() ?? null,
        notes: notes ?? null,
        updatedAt: new Date(),
      },
    });

  return NextResponse.json({ success: true });
}
