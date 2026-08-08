// GET /api/traces/[traceId] - 全链路 Trace 时间线查询
import { NextRequest, NextResponse } from "next/server";
import { getTraceEvents } from "@/lib/services/import-task.service";
import { getDb } from "@/lib/db";
import { importTasks, importTaskErrors } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";

// UUID v4 简单校验（用于识别 taskId 传入）
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ traceId: string }> },
) {
  try {
    const { traceId: rawId } = await params;

    if (!rawId) {
      return NextResponse.json({ success: false, error: "缺少 traceId" }, { status: 400 });
    }

    const db = getDb();
    let traceId = rawId;
    let taskRow: typeof importTasks.$inferSelect | null = null;

    // 兼容：当传入的是 UUID (taskId) 时，先查任务再拿其 traceId
    if (UUID_RE.test(rawId)) {
      const byTaskId = await db
        .select()
        .from(importTasks)
        .where(eq(importTasks.id, rawId))
        .limit(1);
      if (byTaskId[0]) {
        taskRow = byTaskId[0];
        traceId = byTaskId[0].traceId;
      }
    }

    const events = await getTraceEvents(traceId);

    if (!taskRow) {
      const tasks = await db
        .select()
        .from(importTasks)
        .where(eq(importTasks.traceId, traceId))
        .limit(1);
      taskRow = tasks[0] || null;
    }

    return NextResponse.json({
      success: true,
      data: {
        traceId,
        task: taskRow,
        events: events.map((e) => ({
          id: e.id,
          eventName: e.eventName,
          eventStatus: e.eventStatus,
          message: e.message,
          occurredAt: e.occurredAt?.toISOString(),
          unitId: e.unitId,
          metadata: e.metadata,
        })),
      },
    });
  } catch (err: any) {
    console.error("[traces] 查询失败:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
