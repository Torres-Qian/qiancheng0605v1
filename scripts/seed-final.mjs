/**
 * 种子数据 V4 — 使用原生 pg 方式 + 批量多值 INSERT
 * Neon Pooler 的 neon() 函数每次调用都是独立的 HTTP 请求，不会自动提交事务。
 * 使用 transaction() API 确保数据持久化。
 */
import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('No DATABASE_URL'); process.exit(1); }

const sql = neon(DATABASE_URL);
const TOTAL = 20000;
const BATCH = 500;

async function main() {
  const start = Date.now();
  console.log(`[seed] Target: ${TOTAL} SKUs, Batch: ${BATCH}`);

  // 清空（带事务）
  console.log('[seed] Clearing...');
  await sql`DELETE FROM sku_master`;
  const [{ c: beforeCount }] = await sql`SELECT COUNT(*)::int as c FROM sku_master`;
  console.log(`[seed] After clear: ${beforeCount}`);

  // 分批插入，每批在一个事务中
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

    const q = `INSERT INTO sku_master (sku_code, name, spec, unit) VALUES ${vals.join(',')}`;
    await sql.unsafe(q);

    if (end % 5000 === 0 || end === TOTAL) {
      const [{ c }] = await sql`SELECT COUNT(*)::int as c FROM sku_master`;
      console.log(`[seed] ${c}/${TOTAL} (${(end/TOTAL*100).toFixed(0)}%)`);
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const [{ c: finalCount }] = await sql`SELECT COUNT(*)::int as c FROM sku_master`;
  console.log(`\n[seed] Done in ${elapsed}s — count: ${finalCount}`);
  console.log(finalCount >= TOTAL ? '✅ SUCCESS' : `⚠ PARTIAL (${finalCount}/${TOTAL})`);

  // 验证远程API
  console.log('\n[seed] Verifying via remote API...');
  try {
    const r = await fetch('https://qiancheng0605v1.vercel.app/api/import-monitor/summary');
    const j = await r.json();
    console.log(`[seed] Remote API OK: status=${r.status}`);
  } catch (e) {
    console.log(`[seed] Remote API check failed: ${e.message}`);
  }
}

main().catch(e => {
  console.error('[seed] FAIL:', e.message);
  process.exit(1);
});
