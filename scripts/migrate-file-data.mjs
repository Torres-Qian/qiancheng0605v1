/**
 * 数据库迁移 V2 — 使用 neon HTTP transaction
 */
import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });

async function main() {
  // 检查类型
  const sql1 = neon(process.env.DATABASE_URL);
  try {
    const [{ data_type }] = await sql1`
      SELECT data_type FROM information_schema.columns
      WHERE table_name = 'import_tasks' AND column_name = 'file_data'
    `;
    console.log(`[check] file_data type: ${data_type}`);

    if (data_type === 'bytea') {
      console.log('✓ Already bytea');
      return;
    }

    // ALTER 需要写在同一个 HTTP transaction session 中
    const sql2 = neon(process.env.DATABASE_URL, { fullResults: true });

    // 直接尝试 ALTER
    console.log('[migrate] Altering column...');
    const res = await sql2.unsafe(`ALTER TABLE import_tasks ALTER COLUMN file_data TYPE BYTEA USING file_data::BYTEA`);
    console.log('[migrate] Done', res);

    // 等待 2 秒，再次验证
    await new Promise(r => setTimeout(r, 2000));
    const [{ data_type: verify }] = await sql1`
      SELECT data_type FROM information_schema.columns
      WHERE table_name = 'import_tasks' AND column_name = 'file_data'
    `;
    console.log(`[verify] file_data type: ${verify}`);
  } catch (e) {
    console.error('FAIL:', e.message);
  }
}

main();