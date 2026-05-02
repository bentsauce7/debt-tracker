import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/db';
import { aprs, statements } from '@/db/schema';
import { ownsAccount } from '@/lib/account-auth';
import { extractStatement } from '@/lib/extract-statement';

export async function POST(request: NextRequest, { params }: { params: Promise<{ accountId: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { accountId } = await params;
  if (!(await ownsAccount(accountId, userId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

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

    if (!extraction.statementDate) {
      return NextResponse.json(
        { error: 'Could not detect a statement date in the PDF. Please re-upload a clearer copy.' },
        { status: 422 },
      );
    }
    const statementDate = extraction.statementDate;

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

      const mappedRows = extraction.aprs.map((apr) => ({
        accountId,
        aprType: aprTypeMap[apr.type] ?? apr.type,
        aprPercentage: apr.rate.toString(),
        balanceSubjectToApr: apr.balance?.toString() ?? undefined,
      }));
      const extractedTypes = [...new Set(mappedRows.map((r) => r.aprType))];

      await db.delete(aprs).where(
        and(eq(aprs.accountId, accountId), inArray(aprs.aprType, extractedTypes)),
      );
      await db.insert(aprs).values(mappedRows);
    }

    return NextResponse.json({ ok: true, statementDate });
  } catch (err) {
    console.error('upload-statement error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Processing failed' }, { status: 500 });
  }
}
