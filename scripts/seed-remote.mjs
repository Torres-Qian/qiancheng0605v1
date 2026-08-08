/**
 * 远程种子数据灌入 V2 — 分批插入20000条SKU
 */
import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('No DATABASE_URL'); process.exit(1); }

const sql = neon(DATABASE_URL);

async function main() {
  console.log('Connecting to Neon...');

  // 验证连接
  const [{ n }] = await sql`SELECT 1 as n`;
  console.log(`Connection OK: ${n}`);

  // 1. 清空
  console.log('Truncating sku_master...');
  await sql`DELETE FROM sku_master`;
  console.log('Truncated');

  // 2. 批量插入
  const TOTAL = 20000;
  const BATCH = 200;
  console.log(`Inserting ${TOTAL} SKUs...`);

  for (let offset = 0; offset < TOTAL; offset += BATCH) {
    const batchEnd = Math.min(offset + BATCH, TOTAL);
    const rows = [];

    for (let i = offset; i < batchEnd; i++) {
      const idx = i + 1;
      const code = `SKU_${String(idx).padStart(5, '0')}`;
      const name = `商品_${idx}`;
      const specs = ['ml', '个', '箱', 'kg', 'g', 'L'];
      const spec = `${(idx % 49) + 1}${specs[idx % 6]}`;
      rows.push(`('${code}', '${name}', '${spec}', '${specs[idx % 6]}')`);
    }

    const sqlStr = `INSERT INTO sku_master (sku_code, name, spec, unit) VALUES ${rows.join(',')} ON CONFLICT (sku_code) DO NOTHING`;
    await sql.unsafe(sqlStr);

    const progress = batchEnd;
    if (progress % 2000 === 0 || progress === TOTAL) {
      console.log(`  ${progress}/${TOTAL} (${(progress/TOTAL*100).toFixed(0)}%)`);
    }
  }

  // 3. 验证
  const [{ count }] = await sql`SELECT COUNT(*)::int as count FROM sku_master`;
  console.log(`\nDone! sku_master count: ${count} / expected: ${TOTAL}`);
  console.log(count >= TOTAL ? '✅ SUCCESS' : '⚠ PARTIAL');
}

main().catch(e => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
