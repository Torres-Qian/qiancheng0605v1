// 查最新任务的所有错误分布
import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });

async function main() {
  const sql = neon(process.env.DATABASE_URL);

  // 最新任务
  const tasks = await sql`
    SELECT id, file_name, status, total_rows, success_rows, failed_rows
    FROM import_tasks
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const t = tasks[0];
  console.log(`Task: ${t.id} | ${t.status} | S:${t.success_rows}/F:${t.failed_rows}/${t.total_rows}`);

  // 错误分布
  const dist = await sql`
    SELECT error_code, COUNT(*)::int as cnt
    FROM import_task_errors
    WHERE task_id = ${t.id}
    GROUP BY error_code
    ORDER BY cnt DESC
  `;
  console.log('Error distribution:');
  for (const r of dist) console.log(`  ${r.error_code}: ${r.cnt}`);

  // 前 5 条错误
  const sample = await sql`
    SELECT row_number, field_name, raw_value, error_reason
    FROM import_task_errors
    WHERE task_id = ${t.id}
    LIMIT 5
  `;
  console.log('Sample errors:');
  for (const r of sample) console.log(`  Row ${r.row_number} | ${r.field_name} | "${String(r.raw_value).substring(0,30)}" | ${r.error_reason}`);

  // 入库的waybill记录
  const wb = await sql`SELECT COUNT(*)::int as cnt FROM waybills WHERE task_id = ${t.id}`;
  console.log(`\nWaybills inserted for this task: ${wb[0].cnt}`);
}

main().catch(e => console.error(e.message));