import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';

config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

const before = await sql`SELECT COUNT(*)::int AS n FROM accounts WHERE user_id IS NULL`;
console.log(`Rows with NULL user_id before: ${before[0].n}`);

await sql`
  UPDATE accounts
  SET user_id = COALESCE(
    (SELECT user_id FROM plaid_items WHERE plaid_items.id = accounts.item_id),
    (SELECT user_id FROM mx_members WHERE mx_members.id = accounts.mx_member_id)
  )
  WHERE user_id IS NULL
`;

const after = await sql`SELECT COUNT(*)::int AS n FROM accounts WHERE user_id IS NULL`;
console.log(`Rows with NULL user_id after:  ${after[0].n}`);

await sql`CREATE INDEX IF NOT EXISTS accounts_user_id_idx ON accounts (user_id)`;
console.log('Index ensured.');
