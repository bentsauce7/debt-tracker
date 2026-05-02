import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/db';
import { promoPurchases } from '@/db/schema';
import { ownsAccount } from '@/lib/account-auth';

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

  if (!purchase || !(await ownsAccount(purchase.accountId, userId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await db.delete(promoPurchases).where(eq(promoPurchases.id, id));
  return NextResponse.json({ success: true });
}
