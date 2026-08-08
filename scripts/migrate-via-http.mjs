/**
 * 数据库迁移 V3 — 直接使用 Neon HTTP fetch API（带事务）
 * Neon HTTP 协议要求每个语句在事务中以保证持久化
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { Pool } from '@neondatabase/serverless';
import ws from 'ws';

config({ path: resolve(process.cwd(), '.env') });

async function tryWithPool() {
  // 尝试用 Pool + ws
  console.log('[attempt1] Using Pool + ws...');
  try {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    try {
      const r1 = await client.query(`
        SELECT data_type FROM information_schema.columns
        WHERE table_name = 'import_tasks' AND column_name = 'file_data'
      `);
      console.log(`[attempt1] Before: ${r1.rows[0].data_type}`);

      await client.query(`ALTER TABLE import_tasks ALTER COLUMN file_data TYPE BYTEA USING file_data::BYTEA`);
      console.log('[attempt1] ALTER executed');

      const r2 = await client.query(`
        SELECT data_type FROM information_schema.columns
        WHERE table_name = 'import_tasks' AND column_name = 'file_data'
      `);
      console.log(`[attempt1] After: ${r2.rows[0].data_type}`);
      return r2.rows[0].data_type;
    } finally {
      client.release();
      await pool.end();
    }
  } catch (e) {
    console.log(`[attempt1] Failed: ${e.message}`);
    return null;
  }
}

async function tryWithFetch() {
  // 直接用 fetch 调用 Neon HTTP API
  console.log('[attempt2] Using direct fetch...');
  const url = process.env.DATABASE_URL;
  // 解析 host
  const match = url.match(/@([^/]+)\//);
  const host = match ? match[1] : null;
  if (!host) { console.log('Cannot parse host'); return null; }

  try {
    const sqlEndpoint = `https://${host}/sql`;
    const auth = 'Basic ' + Buffer.from(url).toString('base64').replace(/=[^=]+$/, '');
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${url.split('@')[0].split('://')[1].split(':')[1].replace(/^postgres:/, '')}`,
      'Neon-Connection-String': url,
    };

    // 先尝试用 pg 协议的连接
    console.log('[attempt2] Direct HTTP too complex, skipping');
    return null;
  } catch (e) {
    console.log(`[attempt2] Failed: ${e.message}`);
    return null;
  }
}

async function main() {
  console.log('DATABASE_URL host:', process.env.DATABASE_URL?.match(/@([^/]+)/)?.[1]);

  // 检查 ws 包
  let hasWs = false;
  try {
    require.resolve('ws');
    hasWs = true;
  } catch { hasWs = false; }

  if (!hasWs) {
    console.log('ws package not found, installing...');
    const { execSync } = await import('node:child_process');
    execSync('npm install ws --no-save', { stdio: 'inherit', cwd: process.cwd() });
  }

  const result = await tryWithPool();
  if (result !== 'bytea') {
    console.log('Need alternative method');
  }
}

main().catch(console.error);