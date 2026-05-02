import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { db } from '@/db';
import { manualOverrides } from '@/db/schema';
import { ownsAccount } from '@/lib/account-auth';
import { isoDate, numericLike } from '@/lib/validators';

const ManualOverrideSchema = z.object({
  promoExpirationDate: isoDate.nullish(),
  isDeferredInterest: z.boolean().optional(),
  promoAprPercentage: numericLike.nullish(),
  promoBalance: numericLike.nullish(),
  accruedDeferredInterest: numericLike.nullish(),
  notes: z.string().max(2000).nullish(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { accountId } = await params;
  if (!(await ownsAccount(accountId, userId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const parsed = ManualOverrideSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 });
  }
  const { promoExpirationDate, isDeferredInterest, promoAprPercentage, promoBalance, accruedDeferredInterest, notes } = parsed.data;

  const values = {
    accountId,
    promoExpirationDate: promoExpirationDate ?? null,
    isDeferredInterest: isDeferredInterest ?? false,
    promoAprPercentage: promoAprPercentage != null ? Number(promoAprPercentage).toString() : null,
    promoBalance: promoBalance != null ? Number(promoBalance).toString() : null,
    accruedDeferredInterest: accruedDeferredInterest != null ? Number(accruedDeferredInterest).toString() : null,
    notes: notes ?? null,
  };

  await db
    .insert(manualOverrides)
    .values(values)
    .onConflictDoUpdate({
      target: manualOverrides.accountId,
      set: { ...values, updatedAt: new Date() },
    });

  return NextResponse.json({ success: true });
}
