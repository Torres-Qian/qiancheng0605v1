// 查最新任务的错误
import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });

async function main() {
  const sql = neon(process.env.DATABASE_URL);

  // 查最新 demo_1000 任务
  const tasks = await sql`
    SELECT id, file_name, status, total_rows, processed_rows, success_rows, failed_rows, trace_id
    FROM import_tasks
    WHERE file_name LIKE '%demo_1000%' OR file_name LIKE '%1000%'
    ORDER BY created_at DESC
    LIMIT 5
  `;
  console.log('Latest 1000 tasks:');
  for (const t of tasks) {
    console.log(`  ${t.id.substring(0,8)} | ${t.file_name} | ${t.status} | ${t.processed_rows}/${t.total_rows} (S:${t.success_rows}, F:${t.failed_rows})`);
  }

  // 最新任务的错误
  if (tasks[0]) {
    const errors = await sql`
      SELECT row_number, field_name, raw_value, error_code, error_reason
      FROM import_task_errors
      WHERE task_id = ${tasks[0].id}
      LIMIT 10
    `;
    console.log(`\nErrors for ${tasks[0].id.substring(0,8)}:`);
    for (const e of errors) {
      console.log(`  Row ${e.row_number} | ${e.field_name} | ${e.error_code} | ${e.error_reason}`);
    }
  }
}

main().catch(e => console.error(e.message));