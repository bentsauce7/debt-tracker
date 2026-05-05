import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';

config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

const before = {
  plaidItems: (await sql`SELECT COUNT(*)::int AS n FROM plaid_items WHERE user_id IS NULL`)[0].n,
  accounts: (await sql`SELECT COUNT(*)::int AS n FROM accounts WHERE user_id IS NULL`)[0].n,
  liabilities: (await sql`
    SELECT COUNT(*)::int AS n FROM liabilities l
    WHERE EXISTS (SELECT 1 FROM accounts a WHERE a.account_id = l.account_id AND a.user_id IS NULL)
  `)[0].n,
  aprs: (await sql`
    SELECT COUNT(*)::int AS n FROM aprs r
    WHERE EXISTS (SELECT 1 FROM accounts a WHERE a.account_id = r.account_id AND a.user_id IS NULL)
  `)[0].n,
  transactions: (await sql`
    SELECT COUNT(*)::int AS n FROM transactions t
    WHERE EXISTS (SELECT 1 FROM accounts a WHERE a.account_id = t.account_id AND a.user_id IS NULL)
  `)[0].n,
  statements: (await sql`
    SELECT COUNT(*)::int AS n FROM statements s
    WHERE EXISTS (SELECT 1 FROM accounts a WHERE a.account_id = s.account_id AND a.user_id IS NULL)
  `)[0].n,
  manualOverrides: (await sql`
    SELECT COUNT(*)::int AS n FROM manual_overrides m
    WHERE EXISTS (SELECT 1 FROM accounts a WHERE a.account_id = m.account_id AND a.user_id IS NULL)
  `)[0].n,
  promoPurchases: (await sql`
    SELECT COUNT(*)::int AS n FROM promo_purchases p
    WHERE EXISTS (SELECT 1 FROM accounts a WHERE a.account_id = p.account_id AND a.user_id IS NULL)
  `)[0].n,
};

console.log('To be deleted (cascading from 4 orphan plaid_items):');
for (const [k, v] of Object.entries(before)) console.log(`  ${k.padEnd(16)} ${v}`);
console.log();

await sql`DELETE FROM plaid_items WHERE user_id IS NULL`;

const after = {
  plaidItems: (await sql`SELECT COUNT(*)::int AS n FROM plaid_items WHERE user_id IS NULL`)[0].n,
  accounts: (await sql`SELECT COUNT(*)::int AS n FROM accounts WHERE user_id IS NULL`)[0].n,
};

console.log('After delete:');
console.log(`  plaid_items with NULL user_id: ${after.plaidItems}`);
console.log(`  accounts    with NULL user_id: ${after.accounts}`);
