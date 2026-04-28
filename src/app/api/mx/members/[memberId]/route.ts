import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { mxMembers } from '@/db/schema';
import { deleteMxMember } from '@/lib/mx';

export async function DELETE(_req: Request, { params }: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await params;

  const [member] = await db.select().from(mxMembers).where(eq(mxMembers.id, memberId));
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
