/**
 * 远程种子数据 V3 — 逐批INSERT（不用ON CONFLICT，先清空）
 */
import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('No DATABASE_URL'); process.exit(1); }

const sql = neon(DATABASE_URL);
const TOTAL = 20000;
const BATCH = 200;

async function main() {
  const start = Date.now();
  console.log(`[seed-v3] Target: ${TOTAL} SKUs, Batch: ${BATCH}`);

  // 清空
  console.log('[seed-v3] Clearing sku_master...');
  await sql`DELETE FROM sku_master`;
  console.log('[seed-v3] Cleared');

  // 插入
  for (let offset = 0; offset < TOTAL; offset += BATCH) {
    const end = Math.min(offset + BATCH, TOTAL);
    const vals = [];

    for (let i = offset; i < end; i++) {
      const idx = i + 1;
      const code = `SKU_${String(idx).padStart(5, '0')}`;
      const name = `商品_${idx}`;
      const units = ['ml', '个', '箱', 'kg', 'g', 'L'];
      const unit = units[idx % 6];
      const spec = `${(idx % 49) + 1}${unit}`;
      vals.push(`('${code}', '${name}', '${spec}', '${unit}')`);
    }

    const query = `INSERT INTO sku_master (sku_code, name, spec, unit) VALUES ${vals.join(',')}`;
    await sql.unsafe(query);

    const progress = end;
    if (progress % 4000 === 0 || progress === TOTAL) {
      const [{ count }] = await sql`SELECT COUNT(*)::int as count FROM sku_master`;
      console.log(`[seed-v3] ${count}/${TOTAL} (${(progress/TOTAL*100).toFixed(0)}%)`);
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const [{ count }] = await sql`SELECT COUNT(*)::int as count FROM sku_master`;
  console.log(`\n[seed-v3] Done in ${elapsed}s — sku_master count: ${count}`);
  console.log(count >= TOTAL ? '[seed-v3] ✅ SUCCESS' : '[seed-v3] ⚠ PARTIAL');
}

main().catch(e => { console.error('[seed-v3] FAIL:', e.message); process.exit(1); });
