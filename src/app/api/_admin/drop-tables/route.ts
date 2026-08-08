import { NextRequest, NextResponse } from "next/server";
import { Pool } from "@neondatabase/serverless";

const TABLES = [
  "import_tasks",
  "import_task_batches",
  "import_task_errors",
  "event_outbox",
  "batch_performance_log",
  "trace_events",
  "sku_master",
];

export async function POST(_req: NextRequest) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const results: string[] = [];

  try {
    for (const t of TABLES) {
      try {
        await pool.query(`DROP TABLE IF EXISTS "${t}" CASCADE`);
        results.push(`dropped ${t}`);
      } catch (e: any) {
        results.push(`failed ${t}: ${e.message}`);
      }
    }
    const r = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1)`,
      [TABLES]
    );
    return NextResponse.json({ success: true, results, remaining: r.rows.map((x: any) => x.table_name) });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  } finally {
    await pool.end();
  }
}
