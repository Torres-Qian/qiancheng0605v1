import { NextRequest, NextResponse } from "next/server";
import { Pool } from "@neondatabase/serverless";

export async function GET(_req: NextRequest) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const r = await pool.query(`
      SELECT table_name, column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name IN ('import_tasks','import_task_batches','import_task_errors','event_outbox','batch_performance_log','trace_events','sku_master')
      ORDER BY table_name, ordinal_position
    `);
    const byTable: Record<string, any[]> = {};
    for (const row of r.rows) {
      if (!byTable[row.table_name]) byTable[row.table_name] = [];
      byTable[row.table_name].push({
        column: row.column_name,
        type: row.data_type,
        default: row.column_default,
        nullable: row.is_nullable,
      });
    }
    return NextResponse.json({ success: true, tables: byTable });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  } finally {
    await pool.end();
  }
}
