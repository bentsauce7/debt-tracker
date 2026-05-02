import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { db } from '@/db';
import { promoPurchases } from '@/db/schema';
import { ownsAccount } from '@/lib/account-auth';
import { isoDate, numericLike } from '@/lib/validators';

const PromoPurchaseSchema = z.object({
  description: z.string().max(500).nullish(),
  purchaseAmount: numericLike,
  purchaseDate: isoDate.nullish(),
  promoEndDate: isoDate,
  isDeferredInterest: z.boolean().optional(),
  feeAmount: numericLike.nullish(),
  feeType: z.enum(['fixed', 'percentage']).nullish(),
  feeFrequency: z.enum(['monthly', 'quarterly', 'annual', 'one_time']).nullish(),
  accruedDeferredInterest: numericLike.nullish(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { accountId } = await params;
  if (!(await ownsAccount(accountId, userId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const parsed = PromoPurchaseSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 });
  }
  const {
    description,
    purchaseAmount,
    purchaseDate,
    promoEndDate,
    isDeferredInterest,
    feeAmount,
    feeType,
    feeFrequency,
    accruedDeferredInterest,
  } = parsed.data;

  const normalizedFeeAmount =
    feeAmount != null && feeType ? Number(feeAmount).toString() : null;
  const normalizedAccrued =
    accruedDeferredInterest != null ? Number(accruedDeferredInterest).toString() : null;

  const [created] = await db
    .insert(promoPurchases)
    .values({
      accountId,
      description: description || null,
      purchaseAmount: Number(purchaseAmount).toString(),
      purchaseDate: purchaseDate ?? null,
      promoEndDate,
      isDeferredInterest: isDeferredInterest ?? false,
      feeAmount: normalizedFeeAmount,
      feeType: feeType ?? null,
      feeFrequency: feeFrequency ?? null,
      accruedDeferredInterest: normalizedAccrued,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
