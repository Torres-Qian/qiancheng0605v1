/**
 * 测试 bytea INSERT 是否能绕过 UTF-8 限制
 * Neon HTTP 模式下用 sql.query() 显式控制事务
 */
import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });

async function main() {
  const sql = neon(process.env.DATABASE_URL);

  // 测试：插入 raw binary 数据到 bytea 字段
  console.log('[test] Trying bytea INSERT via hex string...');
  try {
    // Neon HTTP 用 hex-encoded bytea
    const hexData = '\\x89504e470d0a1a0a0000000d49484452';
    await sql.query(
      `CREATE TEMP TABLE _test (id int, data bytea)`
    );
    await sql.query(
      `INSERT INTO _test (id, data) VALUES ($1, $2)`,
      [1, hexData]
    );
    const r = await sql.query(`SELECT id, encode(data, 'hex') AS hex FROM _test`);
    console.log('[test] OK:', r.rows);
    await sql.query(`DROP TABLE _test`);
  } catch (e) {
    console.log('[test] Failed:', e.message);
  }
}

main();