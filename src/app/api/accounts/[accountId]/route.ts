import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { manualOverrides } from '@/db/schema';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> },
) {
  const { accountId } = await params;
  const body = await request.json();

  const { promoExpirationDate, isDeferredInterest, promoAprPercentage, notes } = body;

  await db
    .insert(manualOverrides)
    .values({
      accountId,
      promoExpirationDate: promoExpirationDate ?? null,
      isDeferredInterest: isDeferredInterest ?? false,
      promoAprPercentage: promoAprPercentage?.toString() ?? null,
      notes: notes ?? null,
    })
    .onConflictDoUpdate({
      target: manualOverrides.accountId,
      set: {
        promoExpirationDate: promoExpirationDate ?? null,
        isDeferredInterest: isDeferredInterest ?? false,
        promoAprPercentage: promoAprPercentage?.toString() ?? null,
        notes: notes ?? null,
        updatedAt: new Date(),
      },
    });

  return NextResponse.json({ success: true });
}
