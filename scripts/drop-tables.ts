import "dotenv/config";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws as any;

const TABLES = [
  "import_tasks",
  "import_task_batches",
  "import_task_errors",
  "event_outbox",
  "batch_performance_log",
  "trace_events",
  "sku_master",
];

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

(async () => {
  try {
    for (const t of TABLES) {
      try {
        await pool.query(`DROP TABLE IF EXISTS "${t}" CASCADE`);
        console.log(`✓ dropped ${t}`);
      } catch (e: any) {
        console.log(`✗ ${t}: ${e.message}`);
      }
    }
    const r = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1)`,
      [TABLES]
    );
    console.log("\n剩余表:", r.rows.map((x: any) => x.table_name));
  } finally {
    await pool.end();
  }
})();
