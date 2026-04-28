import { NextResponse } from 'next/server';
import { db } from '@/db';
import { mxMembers } from '@/db/schema';
import { getMxMember } from '@/lib/mx';

export async function POST(req: Request) {
  const { member_guid, user_guid } = await req.json();

  if (!member_guid || !user_guid) {
    return NextResponse.json({ error: 'Missing member_guid or user_guid' }, { status: 400 });
  }

  const member = await getMxMember(user_guid, member_guid);

  await db
    .insert(mxMembers)
    .values({
      userGuid: user_guid,
      memberGuid: member.guid,
      institutionCode: member.institution_code,
      institutionName: member.name,
      connectionStatus: member.connection_status,
    })
    .onConflictDoUpdate({
      target: mxMembers.memberGuid,
      set: {
        institutionName: member.name,
        connectionStatus: member.connection_status,
        needsReauth: false,
        updatedAt: new Date(),
      },
    });

  return NextResponse.json({ success: true });
}
