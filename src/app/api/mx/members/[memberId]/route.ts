import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/db';
import { mxMembers } from '@/db/schema';
import { deleteMxMember } from '@/lib/mx';

export async function DELETE(_req: Request, { params }: { params: Promise<{ memberId: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { memberId } = await params;

  const [member] = await db
    .select()
    .from(mxMembers)
    .where(and(eq(mxMembers.id, memberId), eq(mxMembers.userId, userId)));
  if (!member) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  }

  try {
    await deleteMxMember(member.userGuid, member.memberGuid);
  } catch {
    // Proceed with DB deletion even if MX revocation fails
  }

  await db.delete(mxMembers).where(eq(mxMembers.id, memberId));

  return NextResponse.json({ success: true });
}
