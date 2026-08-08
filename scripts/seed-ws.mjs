/**
 * 种子数据 V5 — 使用 neon Pool (WebSocket) 确保数据持久化
 */
import { Pool, neonConfig } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { resolve } from 'path';
import ws from 'ws';

config({ path: resolve(process.cwd(), '.env') });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('No DATABASE_URL'); process.exit(1); }

// 配置 WebSocket
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: DATABASE_URL });
const TOTAL = 20000;
const BATCH = 500;

async function main() {
  const start = Date.now();
  const client = await pool.connect();
  console.log(`[seed-ws] Connected. Target: ${TOTAL} SKUs, Batch: ${BATCH}`);

  try {
    // 清空
    console.log('[seed-ws] Clearing sku_master...');
    await client.query('DELETE FROM sku_master');
    console.log('[seed-ws] Cleared');

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

      await client.query(`INSERT INTO sku_master (sku_code, name, spec, unit) VALUES ${vals.join(',')}`);

      if (end % 5000 === 0 || end === TOTAL) {
        const res = await client.query('SELECT COUNT(*)::int as c FROM sku_master');
        console.log(`[seed-ws] ${res.rows[0].c}/${TOTAL} (${(end/TOTAL*100).toFixed(0)}%)`);
      }
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const res = await client.query('SELECT COUNT(*)::int as c FROM sku_master');
    console.log(`\n[seed-ws] Done in ${elapsed}s — count: ${res.rows[0].c}`);
    console.log(res.rows[0].c >= TOTAL ? '✅ SUCCESS' : `⚠ PARTIAL`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => {
  console.error('[seed-ws] FAIL:', e.message);
  process.exit(1);
});
