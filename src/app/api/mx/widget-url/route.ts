import { NextResponse } from 'next/server';
import { db } from '@/db';
import { mxMembers } from '@/db/schema';
import { getOrCreateMxUserGuid, getMxWidgetUrl } from '@/lib/mx';

export async function GET() {
  // Reuse existing user guid if any member exists, otherwise create a new MX user
  const [existing] = await db.select({ userGuid: mxMembers.userGuid }).from(mxMembers).limit(1);

  const userGuid = existing?.userGuid ?? (await getOrCreateMxUserGuid('shared-household'));
  const url = await getMxWidgetUrl(userGuid);

  return NextResponse.json({ url });
}
