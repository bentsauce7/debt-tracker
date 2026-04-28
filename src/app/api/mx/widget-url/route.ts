import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { mxMembers } from '@/db/schema';
import { getOrCreateMxUserGuid, getMxWidgetUrl } from '@/lib/mx';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Reuse existing MX user guid for this Clerk user, or create a new one
  const [existing] = await db
    .select({ userGuid: mxMembers.userGuid })
    .from(mxMembers)
    .where(eq(mxMembers.userId, userId))
    .limit(1);

  const userGuid = existing?.userGuid ?? (await getOrCreateMxUserGuid(userId));
  const url = await getMxWidgetUrl(userGuid);

  return NextResponse.json({ url });
}
