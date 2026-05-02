import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/db';
import { mxMembers, accounts } from '@/db/schema';
import { getMxMemberAccounts, getMxMember, isMxCreditAccount } from '@/lib/mx';

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const errors: string[] = [];
  let membersSynced = 0;
  let accountsUpdated = 0;

  const members = await db
    .select()
    .from(mxMembers)
    .where(and(eq(mxMembers.userId, userId), eq(mxMembers.needsReauth, false)));

  for (const member of members) {
    const label = member.institutionName ?? member.memberGuid;
    try {
      // Refresh connection status
      const live = await getMxMember(member.userGuid, member.memberGuid);

      if (live.connection_status !== 'CONNECTED') {
        await db
          .update(mxMembers)
          .set({ needsReauth: true, connectionStatus: live.connection_status, updatedAt: new Date() })
          .where(eq(mxMembers.id, member.id));
        errors.push(`${label}: needs reauthorization (${live.connection_status})`);
        continue;
      }

      const mxAccounts = await getMxMemberAccounts(member.userGuid, member.memberGuid);
      const creditAccounts = mxAccounts.filter(isMxCreditAccount);

      for (const acct of creditAccounts) {
        await db
          .insert(accounts)
          .values({
            userId,
            mxMemberId: member.id,
            accountId: acct.guid,
            name: acct.name,
            mask: acct.account_number_suffix ?? undefined,
            type: 'credit',
            subtype: acct.account_type.toLowerCase(),
            currentBalance: acct.balance?.toString() ?? undefined,
            availableBalance: acct.available_balance?.toString() ?? undefined,
            creditLimit: acct.credit_limit?.toString() ?? undefined,
            lastSyncedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: accounts.accountId,
            set: {
              name: acct.name,
              mask: acct.account_number_suffix ?? undefined,
              currentBalance: acct.balance?.toString() ?? undefined,
              availableBalance: acct.available_balance?.toString() ?? undefined,
              creditLimit: acct.credit_limit?.toString() ?? undefined,
              lastSyncedAt: new Date(),
            },
          });
        accountsUpdated++;
      }

      membersSynced++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${label}: ${msg}`);
    }
  }

  return NextResponse.json({ success: true, membersSynced, accountsUpdated, errors });
}
