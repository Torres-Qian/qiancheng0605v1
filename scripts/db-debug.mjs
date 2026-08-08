import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('No DATABASE_URL'); process.exit(1); }

const sql = neon(DATABASE_URL);

async function main() {
  console.log('Connecting...');
  const [{ n }] = await sql`SELECT 1 as n`;
  console.log(`OK: ${n}`);

  // 检查当前状态
  const [{ count: before }] = await sql`SELECT COUNT(*)::int as count FROM sku_master`;
  console.log(`Before: ${before} SKUs`);

  // 测试单条插入
  console.log('Test insert SKU_00001...');
  try {
    await sql`INSERT INTO sku_master (sku_code, name, spec, unit) VALUES ('SKU_00001', 'test', '1ml', 'ml')`;
    console.log('Insert OK');
  } catch (e) {
    console.log('Insert error:', e.message);
  }

  const [{ count: after }] = await sql`SELECT COUNT(*)::int as count FROM sku_master`;
  console.log(`After: ${after} SKUs`);

  // 查询验证
  const rows = await sql`SELECT sku_code, name FROM sku_master LIMIT 3`;
  console.log('Sample rows:', JSON.stringify(rows));
}

main().catch(e => console.error('FAIL:', e.message));
