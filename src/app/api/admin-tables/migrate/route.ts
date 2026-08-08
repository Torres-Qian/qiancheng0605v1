import { NextRequest, NextResponse } from "next/server";
import { Pool } from "@neondatabase/serverless";

const SQL = `
-- SKU 主数据
CREATE TABLE IF NOT EXISTS "sku_master" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "sku_code" varchar(255) NOT NULL,
  "name" varchar(255) NOT NULL,
  "spec" varchar(255),
  "unit" varchar(50),
  "created_at" timestamp DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "sku_master_code_unique" ON "sku_master"("sku_code");

-- 导入任务主表
CREATE TABLE IF NOT EXISTS "import_tasks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "file_name" varchar(500) NOT NULL,
  "file_path" text,
  "file_data" text,
  "parse_rule_id" uuid,
  "status" varchar(20) NOT NULL DEFAULT 'PENDING',
  "total_rows" integer NOT NULL DEFAULT 0,
  "processed_rows" integer NOT NULL DEFAULT 0,
  "success_rows" integer NOT NULL DEFAULT 0,
  "failed_rows" integer NOT NULL DEFAULT 0,
  "total_batches" integer NOT NULL DEFAULT 0,
  "completed_batches" integer NOT NULL DEFAULT 0,
  "trace_id" varchar(100) NOT NULL,
  "degraded" boolean NOT NULL DEFAULT false,
  "degraded_reason" text,
  "created_at" timestamp DEFAULT now(),
  "completed_at" timestamp
);
CREATE INDEX IF NOT EXISTS "import_tasks_status_idx" ON "import_tasks"("status");
CREATE INDEX IF NOT EXISTS "import_tasks_created_at_idx" ON "import_tasks"("created_at");
CREATE INDEX IF NOT EXISTS "import_tasks_trace_id_idx" ON "import_tasks"("trace_id");

-- 处理单元状态表
CREATE TABLE IF NOT EXISTS "import_task_batches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "task_id" uuid NOT NULL REFERENCES "import_tasks"("id") ON DELETE CASCADE,
  "unit_id" varchar(100) NOT NULL,
  "batch_index" integer NOT NULL,
  "start_row" integer NOT NULL,
  "end_row" integer NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'PENDING',
  "retry_count" integer NOT NULL DEFAULT 0,
  "locked_at" timestamp,
  "completed_at" timestamp,
  "error_message" text,
  "created_at" timestamp DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "batches_task_unit_unique" ON "import_task_batches"("task_id", "unit_id");
CREATE INDEX IF NOT EXISTS "batches_task_id_idx" ON "import_task_batches"("task_id");

-- 行级错误明细表
CREATE TABLE IF NOT EXISTS "import_task_errors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "task_id" uuid NOT NULL REFERENCES "import_tasks"("id") ON DELETE CASCADE,
  "batch_index" integer NOT NULL,
  "unit_id" varchar(100),
  "row_number" integer NOT NULL,
  "field_name" varchar(255),
  "raw_value" text,
  "error_code" varchar(10) NOT NULL,
  "error_reason" text NOT NULL,
  "trace_id" varchar(100),
  "created_at" timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "errors_task_id_idx" ON "import_task_errors"("task_id");
CREATE INDEX IF NOT EXISTS "errors_task_unit_idx" ON "import_task_errors"("task_id", "unit_id");
CREATE INDEX IF NOT EXISTS "errors_error_code_idx" ON "import_task_errors"("error_code");

-- 本地可靠事件表（Outbox）
CREATE TABLE IF NOT EXISTS "event_outbox" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "aggregate_id" varchar(100) NOT NULL,
  "event_type" varchar(100) NOT NULL,
  "payload" jsonb NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "retry_count" integer NOT NULL DEFAULT 0,
  "next_retry_at" timestamp,
  "created_at" timestamp DEFAULT now(),
  "sent_at" timestamp
);
CREATE INDEX IF NOT EXISTS "outbox_status_next_retry_idx" ON "event_outbox"("status", "next_retry_at");
CREATE INDEX IF NOT EXISTS "outbox_aggregate_idx" ON "event_outbox"("aggregate_id");

-- 处理单元性能日志
CREATE TABLE IF NOT EXISTS "batch_performance_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "task_id" uuid NOT NULL REFERENCES "import_tasks"("id") ON DELETE CASCADE,
  "unit_id" varchar(100) NOT NULL,
  "batch_index" integer NOT NULL,
  "parse_duration_ms" integer NOT NULL DEFAULT 0,
  "rule_duration_ms" integer NOT NULL DEFAULT 0,
  "validate_duration_ms" integer NOT NULL DEFAULT 0,
  "insert_duration_ms" integer NOT NULL DEFAULT 0,
  "total_duration_ms" integer NOT NULL DEFAULT 0,
  "row_count" integer NOT NULL DEFAULT 0,
  "status" varchar(20) NOT NULL,
  "trace_id" varchar(100),
  "created_at" timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "perf_log_task_unit_idx" ON "batch_performance_log"("task_id", "unit_id");

-- 链路时间线事件
CREATE TABLE IF NOT EXISTS "trace_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "trace_id" varchar(100) NOT NULL,
  "task_id" uuid,
  "unit_id" varchar(100),
  "event_name" varchar(100) NOT NULL,
  "event_status" varchar(20) NOT NULL DEFAULT 'SUCCESS',
  "message" text,
  "metadata" jsonb,
  "occurred_at" timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "trace_events_trace_id_idx" ON "trace_events"("trace_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "trace_events_task_id_idx" ON "trace_events"("task_id");
`;

export async function GET(_req: NextRequest) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(SQL);
    const r = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('import_tasks','import_task_batches','import_task_errors','event_outbox','batch_performance_log','trace_events','sku_master') ORDER BY table_name`
    );
    return NextResponse.json({ success: true, tables: r.rows.map((x: any) => x.table_name) });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  } finally {
    await pool.end();
  }
}
