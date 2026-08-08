/**
 * 远程种子数据灌入脚本 — 直接连接 Neon PostgreSQL
 * 用法: npx tsx scripts/seed-remote.ts
 */

import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set in .env');
  process.exit(1);
}

const sql = neon(DATABASE_URL);
const BATCH = 500;
const TOTAL = 20000;

async function main() {
  console.log('[seed-remote] Starting...');

  // 1. 清空
  console.log('[seed-remote] TRUNCATE sku_master...');
  await sql`TRUNCATE TABLE sku_master RESTART IDENTITY CASCADE`;
  console.log('[seed-remote] TRUNCATE done');

  // 2. 批量插入
  console.log(`[seed-remote] Inserting ${TOTAL} SKUs in batches of ${BATCH}...`);

  for (let offset = 0; offset < TOTAL; offset += BATCH) {
    const batchSize = Math.min(BATCH, TOTAL - offset);
    const rows = [];

    for (let i = 0; i < batchSize; i++) {
      const idx = offset + i + 1;
      const code = `SKU_${String(idx).padStart(5, '0')}`;
      const name = `商品_${idx}`;
      const specs = ['ml', '个', '箱', 'kg', 'g', 'L'];
      const spec = specs[idx % 6];
      const val = Math.floor(Math.random() * 50) + 1;
      rows.push({ code, name, spec: `${val}${spec}`, unit: spec });
    }

    // 构造 VALUES 子句
    const values = rows.map(r =>
      `('${r.code}', '${r.name}', '${r.spec}', '${r.unit}', NOW())`
    ).join(',\n');

    await sql.unsafe(`
      INSERT INTO sku_master (sku_code, name, spec, unit, created_at)
      VALUES ${values}
      ON CONFLICT (sku_code) DO NOTHING
    `);

    const progress = Math.min(offset + batchSize, TOTAL);
    console.log(`[seed-remote] ${progress}/${TOTAL} (${(progress / TOTAL * 100).toFixed(0)}%)`);
  }

  // 3. 验证
  const [{ count }] = await sql`SELECT COUNT(*)::int as count FROM sku_master`;
  console.log(`[seed-remote] Done! sku_master count: ${count}`);

  if (count < TOTAL) {
    console.warn(`[seed-remote] WARNING: expected ${TOTAL}, got ${count}`);
  }
}

main().catch(err => {
  console.error('[seed-remote] FAILED:', err.message);
  process.exit(1);
});
