import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';

config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

const items = await sql`
  SELECT id, item_id, user_id, institution_name, created_at
  FROM plaid_items
  ORDER BY created_at
`;

console.log(`${items.length} plaid_items total\n`);
const distinctUserIds = new Set(items.map((i) => i.user_id).filter(Boolean));
console.log(`Distinct non-null user_ids: ${[...distinctUserIds].join(', ') || '(none)'}\n`);
for (const it of items) {
  console.log(`- ${it.institution_name ?? it.item_id}  userId=${it.user_id ?? 'NULL'}  created=${it.created_at}`);
}
