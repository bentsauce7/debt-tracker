import Anthropic from '@anthropic-ai/sdk';
import type { ExtractedApr, ExtractedPromoPurchase } from '@/db/schema';

const client = new Anthropic();

export type StatementExtraction = {
  statementDate: string | null;
  closingBalance: number | null;
  minimumPayment: number | null;
  paymentDueDate: string | null;
  aprs: ExtractedApr[];
  promoPurchases: ExtractedPromoPurchase[];
};

const PROMPT = `You are extracting structured financial data from a credit card statement PDF.

Return a JSON object with exactly this shape:
{
  "statementDate": <statement closing/period end date as "YYYY-MM-DD" or null>,
  "closingBalance": <number or null>,
  "minimumPayment": <number or null>,
  "paymentDueDate": <"YYYY-MM-DD" or null>,
  "aprs": [
    {
      "type": <"purchase" | "balance_transfer" | "cash_advance" | "promotional" | "penalty" | string>,
      "rate": <APR percentage as a number, e.g. 29.99>,
      "balance": <balance subject to this APR as number, or null>,
      "expirationDate": <"YYYY-MM-DD" for promotional rates, or null>
    }
  ],
  "promoPurchases": [
    {
      "description": <merchant name or purchase description>,
      "amount": <purchase amount as number>,
      "purchaseDate": <"YYYY-MM-DD" or null>,
      "promoEndDate": <"YYYY-MM-DD" or null>,
      "isDeferredInterest": <true if "no interest if paid in full" style, false for true 0% promo>,
      "feeAmount": <fee value as a number, or null. Dollars if feeType="fixed", percent if "percentage". Null when isDeferredInterest=true or no fee applies>,
      "feeType": <"fixed" | "percentage" | null>,
      "feeFrequency": <"monthly" | "quarterly" | "annual" | "one_time" | null>,
      "accruedDeferredInterest": <dollar amount of deferred interest currently accrued on this individual purchase, as a number, or null. Only applies to deferred-interest plans>
    }
  ]
}

Rules:
- Extract ALL APR types shown on the statement including promotional rates
- For promotional/deferred interest purchases listed individually on the statement, include each as a separate entry in promoPurchases
- Skip any promotional purchase row whose remaining balance is $0 (or $0.00). These are already-paid-off plans (e.g. Citi Flex Plan 4, 6, 7, 8 listed with a $0 balance) — do not include them in promoPurchases at all.
- Also include bank-branded installment / "pay over time" / promotional financing plans as promoPurchases entries. Common program names to look for:
  - Citi: "Citi Flex Pay", "Citi Flex Loan", "Flex Plan"
  - Chase: "My Chase Plan", "Chase Pay Over Time"
  - American Express: "Plan It", "Pay It Plan It", "Amex Plan"
  - Wells Fargo: "Purchase Offer", "Balance Transfer Offer", "Special Purchase"
  - PayPal Credit: "Easy Payments" (6/12/24-month no-interest promos), "Promotional Purchase"
  - PayPal: "Pay in 4", "Pay Monthly" (BNPL)
  - Synchrony: "Special Financing", "Promotional Financing", "Equal Payment" / "Equal Pay" plans, "Deferred Interest" plans (used by Lowe's, Ashley, Mattress Firm, and many other Synchrony-issued retail cards)
  - CareCredit: promotional financing (medical/dental)
  - Amazon Store Card: "Equal Pay", "Special Financing"
  For each plan, set amount = the remaining balance still owed on that plan (NOT the original purchase price; when the statement shows both, always use the still-owed balance). purchaseDate = the original purchase date. promoEndDate = the plan end / final payment date.
- isDeferredInterest = true for "No Interest if Paid in Full" / "Deferred Interest" offers — interest accrues from day one and posts retroactively if the balance is not paid by the promo end date. Common on Synchrony "Special Financing" / "Promotional Financing", PayPal Credit "Easy Payments", CareCredit promotional financing, Amazon Store Card "Special Financing", and most retail-store Synchrony cards (Lowe's, Ashley, Mattress Firm, etc.).
- isDeferredInterest = false for fixed-fee installment plans (Citi Flex Pay/Loan, My Chase Plan, Amex Plan It, Wells Fargo offers, PayPal Pay in 4 / Pay Monthly, "Equal Payment" / "Equal Pay" plans) and for true 0% APR promotions where no retroactive interest applies.
- For deferred-interest plans, look for the per-purchase accrued deferred interest amount and put it in accruedDeferredInterest. PayPal Credit and Synchrony statements typically list this in the Promotional Purchase details section under labels such as "Accrued Interest Charges", "Deferred Interest Charges Accrued", or "Accrued interest if not paid in full". The corresponding total is often labeled "Total Accrued Deferred Interest" or "Total Accrued Interest Charges" — DO NOT use the total here; use the per-purchase row's accrued figure. Leave this field null when isDeferredInterest=false or when the statement does not list a per-purchase accrued amount.
- For installment / "pay over time" plans (isDeferredInterest=false), extract the plan fee whenever the statement shows one. The fee is usually disclosed near the plan listing and can be either a fixed dollar amount (e.g. "Plan fee: $1.50/month") or a percentage of the original purchase (e.g. "1.72% monthly fee", "Monthly fee rate: 1.72%"). Set feeType="fixed" for dollar amounts and feeType="percentage" for percentages. Set feeFrequency to "monthly", "quarterly", "annual", or "one_time" based on how the statement describes it (default to "monthly" only if the cadence is clearly implied by the per-payment schedule). Examples by issuer:
  - Citi Flex Pay / Flex Loan: typically a monthly percentage fee of the original purchase (feeType="percentage", feeFrequency="monthly")
  - My Chase Plan: fixed monthly dollar fee shown explicitly (feeType="fixed", feeFrequency="monthly")
  - Amex Plan It / Pay It Plan It: fixed monthly dollar fee shown explicitly (feeType="fixed", feeFrequency="monthly")
  - Wells Fargo offers: may be a one-time setup fee or monthly fee — read the disclosure
  - "Equal Pay" / "Equal Payment" plans (Amazon, Synchrony retail): often have no plan fee — leave fee fields null
  If the statement does not disclose a fee, leave feeAmount, feeType, and feeFrequency as null.
- If a field is not present on the statement, use null
- Amounts should be positive numbers (no negative signs)
- Return ONLY the JSON object, no explanation`;

export async function extractStatement(pdfBase64: string): Promise<StatementExtraction> {
  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 8192,
    system: [
      {
        type: 'text',
        text: PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: pdfBase64,
            },
          },
          {
            type: 'text',
            text: 'Extract structured data from the attached statement following the rules in the system prompt. Return ONLY the JSON object.',
          },
        ],
      },
    ],
  });

  console.log('extract-statement usage', {
    cacheCreate: response.usage.cache_creation_input_tokens,
    cacheRead: response.usage.cache_read_input_tokens,
    input: response.usage.input_tokens,
    output: response.usage.output_tokens,
  });

  if (response.stop_reason === 'max_tokens') {
    throw new Error('Statement too large to extract — model output was truncated');
  }

  const text = response.content.find((b) => b.type === 'text')?.text ?? '';
  const json = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  if (!json) {
    throw new Error('Model returned empty response — try a different statement PDF');
  }

  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Failed to parse extracted statement data');
  }

  // Defensive: drop promo rows with no remaining balance (paid-off plans
  // sometimes still appear in the model output despite the prompt rule).
  const rawPromoPurchases: ExtractedPromoPurchase[] = Array.isArray(parsed.promoPurchases)
    ? parsed.promoPurchases
    : [];
  const promoPurchasesFiltered = rawPromoPurchases.filter(
    (p) => Number.isFinite(p?.amount) && Number(p.amount) > 0,
  );

  return {
    statementDate: parsed.statementDate ?? null,
    closingBalance: parsed.closingBalance ?? null,
    minimumPayment: parsed.minimumPayment ?? null,
    paymentDueDate: parsed.paymentDueDate ?? null,
    aprs: Array.isArray(parsed.aprs) ? parsed.aprs : [],
    promoPurchases: promoPurchasesFiltered,
  };
}
