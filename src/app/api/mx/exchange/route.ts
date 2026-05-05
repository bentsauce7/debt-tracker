import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { mxMembers } from '@/db/schema';
import { getMxMember } from '@/lib/mx';

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { member_guid, user_guid } = await req.json();

  if (!member_guid || !user_guid) {
    return NextResponse.json({ error: 'Missing member_guid or user_guid' }, { status: 400 });
  }

  // Reject if user_guid already belongs to a different Clerk user — prevents
  // one user claiming another user's MX connection by guessing their GUIDs.
  const [existing] = await db
    .select({ userId: mxMembers.userId })
    .from(mxMembers)
    .where(eq(mxMembers.userGuid, user_guid))
    .limit(1);
  if (existing && existing.userId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const member = await getMxMember(user_guid, member_guid);

  await db
    .insert(mxMembers)
    .values({
      userId,
      userGuid: user_guid,
      memberGuid: member.guid,
      institutionCode: member.institution_code,
      institutionName: member.name,
      connectionStatus: member.connection_status,
    })
    .onConflictDoUpdate({
      target: mxMembers.memberGuid,
      set: {
        userId,
        institutionName: member.name,
        connectionStatus: member.connection_status,
        needsReauth: false,
        updatedAt: new Date(),
      },
    });

  return NextResponse.json({ success: true });
}
