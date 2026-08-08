// 检查最近任务状态
import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });

async function main() {
  const sql = neon(process.env.DATABASE_URL);
  const tasks = await sql`
    SELECT id, file_name, status, total_rows, success_rows, failed_rows, created_at
    FROM import_tasks
    ORDER BY created_at DESC LIMIT 3
  `;
  for (const t of tasks) {
    console.log(`${t.id.substring(0,8)} | ${t.file_name} | ${t.status} | S:${t.success_rows}/F:${t.failed_rows}/${t.total_rows}`);
  }
}
main().catch(console.error);