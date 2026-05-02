import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { accounts, plaidItems, mxMembers } from '@/db/schema';

export async function ownsAccount(accountId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ plaidUserId: plaidItems.userId, mxUserId: mxMembers.userId })
    .from(accounts)
    .leftJoin(plaidItems, eq(plaidItems.id, accounts.itemId))
    .leftJoin(mxMembers, eq(mxMembers.id, accounts.mxMemberId))
    .where(eq(accounts.accountId, accountId))
    .limit(1);
  if (!row) return false;
  return row.plaidUserId === userId || row.mxUserId === userId;
}
