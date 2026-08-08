// 直接查DB - demo_1000的运单
import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });

async function main() {
  const sql = neon(process.env.DATABASE_URL);

  // 总数
  const [{ total }] = await sql`SELECT COUNT(*)::int as total FROM waybills`;
  console.log('Total waybills:', total);

  // 按 sourceFile 分组
  const byFile = await sql`
    SELECT source_file, COUNT(*)::int as cnt
    FROM waybills
    GROUP BY source_file
    ORDER BY cnt DESC
    LIMIT 10
  `;
  console.log('\nBy source file:');
  for (const r of byFile) console.log(`  ${r.source_file || 'NULL'}: ${r.cnt}`);

  // demo_1000 最近导入的 task
  const recent = await sql`
    SELECT task_id, source_file, COUNT(*)::int as cnt, MAX(created_at) as last
    FROM waybills
    WHERE source_file LIKE '%demo_1000%' OR source_file LIKE '%1000%'
    GROUP BY task_id, source_file
    ORDER BY last DESC
    LIMIT 5
  `;
  console.log('\ndemo_1000 tasks:');
  for (const r of recent) console.log(`  ${r.task_id}: ${r.cnt} rows`);
}

main().catch(e => console.error(e.message));