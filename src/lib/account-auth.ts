import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { accounts } from '@/db/schema';

export async function ownsAccount(accountId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.accountId, accountId), eq(accounts.userId, userId)))
    .limit(1);
  return !!row;
}
