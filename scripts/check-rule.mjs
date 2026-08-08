// 查压测规则的配置
import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });

async function main() {
  const sql = neon(process.env.DATABASE_URL);
  const r = await sql`
    SELECT id, name, file_type, rule_config
    FROM parse_rules
    WHERE id = 'ccfdd79d-5fe4-49db-a40f-31ec06b57138'
  `;
  console.log('Rule:', JSON.stringify(r[0], null, 2));
}

main().catch(e => console.error(e.message));