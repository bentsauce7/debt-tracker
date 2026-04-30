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
      "isDeferredInterest": <true if "no interest if paid in full" style, false for true 0% promo>
    }
  ]
}

Rules:
- Extract ALL APR types shown on the statement including promotional rates
- For promotional/deferred interest purchases listed individually on the statement, include each as a separate entry in promoPurchases
- isDeferredInterest = true for "No Interest if Paid in Full" offers (common on PayPal Credit, Synchrony, etc.)
- isDeferredInterest = false for true 0% APR promotions
- If a field is not present on the statement, use null
- Amounts should be positive numbers (no negative signs)
- Return ONLY the JSON object, no explanation`;

export async function extractStatement(pdfBase64: string): Promise<StatementExtraction> {
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 8192,
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
            text: PROMPT,
          },
        ],
      },
    ],
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

  return {
    statementDate: parsed.statementDate ?? null,
    closingBalance: parsed.closingBalance ?? null,
    minimumPayment: parsed.minimumPayment ?? null,
    paymentDueDate: parsed.paymentDueDate ?? null,
    aprs: Array.isArray(parsed.aprs) ? parsed.aprs : [],
    promoPurchases: Array.isArray(parsed.promoPurchases) ? parsed.promoPurchases : [],
  };
}
