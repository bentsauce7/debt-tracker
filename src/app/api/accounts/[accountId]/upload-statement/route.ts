import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/db';
import { accounts, aprs, statements, plaidItems, mxMembers } from '@/db/schema';
import { extractStatement } from '@/lib/extract-statement';

export async function POST(request: NextRequest, { params }: { params: Promise<{ accountId: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { accountId } = await params;

  const [row] = await db
    .select()
    .from(accounts)
    .leftJoin(plaidItems, eq(plaidItems.id, accounts.itemId))
    .leftJoin(mxMembers, eq(mxMembers.id, accounts.mxMemberId))
    .where(eq(accounts.accountId, accountId))
    .limit(1);

  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const ownerUserId = row.plaid_items?.userId ?? row.mx_members?.userId;
  if (ownerUserId !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let file: File | null = null;
  try {
    const formData = await request.formData();
    file = formData.get('pdf') as File | null;
  } catch {
    return NextResponse.json({ error: 'Failed to parse upload' }, { status: 400 });
  }

  if (!file) return NextResponse.json({ error: 'No PDF provided' }, { status: 400 });

  try {
    const bytes = await file.arrayBuffer();
    const pdfBase64 = Buffer.from(bytes).toString('base64');

    const extraction = await extractStatement(pdfBase64);

    const statementDate = extraction.statementDate ?? new Date().toISOString().slice(0, 7) + '-01';

    await db.insert(statements).values({
      accountId,
      plaidStatementId: `manual_${randomUUID()}`,
      statementDate,
      closingBalance: extraction.closingBalance?.toString() ?? undefined,
      minimumPayment: extraction.minimumPayment?.toString() ?? undefined,
      paymentDueDate: extraction.paymentDueDate ?? undefined,
      extractedAprs: extraction.aprs,
      extractedPromoPurchases: extraction.promoPurchases,
    });

    if (extraction.aprs.length > 0) {
      const aprTypeMap: Record<string, string> = {
        purchase: 'purchase_apr',
        balance_transfer: 'balance_transfer_apr',
        cash_advance: 'cash_apr',
        promotional: 'special',
      };

      await db.delete(aprs).where(eq(aprs.accountId, accountId));
      await db.insert(aprs).values(
        extraction.aprs.map((apr) => ({
          accountId,
          aprType: aprTypeMap[apr.type] ?? apr.type,
          aprPercentage: apr.rate.toString(),
          balanceSubjectToApr: apr.balance?.toString() ?? undefined,
        })),
      );
    }

    return NextResponse.json({ ok: true, statementDate });
  } catch (err) {
    console.error('upload-statement error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Processing failed' }, { status: 500 });
  }
}
