import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';

config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

const rows = await sql`
  SELECT
    a.id,
    a.account_id,
    a.name,
    a.type,
    a.subtype,
    a.item_id,
    a.mx_member_id,
    a.last_synced_at,
    p.user_id AS plaid_user_id,
    p.institution_name AS plaid_institution,
    m.user_id AS mx_user_id,
    m.institution_name AS mx_institution
  FROM accounts a
  LEFT JOIN plaid_items p ON p.id = a.item_id
  LEFT JOIN mx_members m ON m.id = a.mx_member_id
  WHERE a.user_id IS NULL
  ORDER BY a.last_synced_at DESC NULLS LAST
`;

console.log(`Found ${rows.length} accounts with NULL user_id:\n`);
for (const r of rows) {
  console.log(`- ${r.name} (${r.type}/${r.subtype ?? '-'})`);
  console.log(`    accountId: ${r.account_id}`);
  console.log(`    itemId:    ${r.item_id ?? 'null'}    ${r.plaid_institution ?? ''}    plaid_user_id: ${r.plaid_user_id ?? 'null'}`);
  console.log(`    mxMember:  ${r.mx_member_id ?? 'null'}    ${r.mx_institution ?? ''}    mx_user_id: ${r.mx_user_id ?? 'null'}`);
  console.log(`    lastSync:  ${r.last_synced_at ?? 'never'}`);
  console.log();
}
