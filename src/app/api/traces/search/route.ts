/**
 * Trace 多条件搜索 API
 * GET /api/traces/search?fileName=xxx&batchIndex=0&rowNumber=100&errorCode=E001
 */
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { traceEvents, importTasks, importTaskBatches, importTaskErrors } from "@/lib/db/schema";
import { eq, like, and, desc, inArray } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const fileName = searchParams.get("fileName");
    const batchIndex = searchParams.get("batchIndex");
    const rowNumber = searchParams.get("rowNumber");
    const errorCode = searchParams.get("errorCode");

    let matchedTasks: { id: string; fileName: string; status: string; traceId: string }[] = [];

    async function fetchTasksByIds(taskIds: string[]) {
      if (taskIds.length === 0) return [];
      return db
        .select({
          id: importTasks.id,
          fileName: importTasks.fileName,
          status: importTasks.status,
          traceId: importTasks.traceId,
        })
        .from(importTasks)
        .where(inArray(importTasks.id, taskIds))
        .orderBy(desc(importTasks.createdAt))
        .limit(10);
    }

    // 按文件名搜索
    if (fileName) {
      matchedTasks = await db
        .select({
          id: importTasks.id,
          fileName: importTasks.fileName,
          status: importTasks.status,
          traceId: importTasks.traceId,
        })
        .from(importTasks)
        .where(like(importTasks.fileName, `%${fileName}%`))
        .orderBy(desc(importTasks.createdAt))
        .limit(10);
    }

    // 按批次号搜索
    if (batchIndex !== null) {
      const batchIdx = parseInt(batchIndex, 10);
      if (!Number.isNaN(batchIdx)) {
        const batches = await db
          .select({ taskId: importTaskBatches.taskId })
          .from(importTaskBatches)
          .where(eq(importTaskBatches.batchIndex, batchIdx))
          .limit(50);

        const taskIds = [...new Set(batches.map((b) => b.taskId))];
        matchedTasks = await fetchTasksByIds(taskIds);
      }
    }

    // 按行号搜索
    if (rowNumber !== null) {
      const rowNum = parseInt(rowNumber, 10);
      if (!Number.isNaN(rowNum)) {
        const errors = await db
          .select({ taskId: importTaskErrors.taskId })
          .from(importTaskErrors)
          .where(eq(importTaskErrors.rowNumber, rowNum))
          .limit(50);

        const taskIds = [...new Set(errors.map((e) => e.taskId))];
        matchedTasks = await fetchTasksByIds(taskIds);
      }
    }

    // 按错误码搜索
    if (errorCode) {
      const errors = await db
        .select({ taskId: importTaskErrors.taskId })
        .from(importTaskErrors)
        .where(eq(importTaskErrors.errorCode, errorCode.toUpperCase()))
        .limit(50);

      const taskIds = [...new Set(errors.map((e) => e.taskId))];
      matchedTasks = await fetchTasksByIds(taskIds);
    }

    if (matchedTasks.length === 0) {
      return NextResponse.json({
        success: true,
        data: { events: [], task: null },
        message: "未找到匹配的记录",
      });
    }

    // 取第一个匹配任务的 traceId 获取时间线
    const task = matchedTasks[0];
    const events = await db
      .select()
      .from(traceEvents)
      .where(eq(traceEvents.traceId, task.traceId))
      .orderBy(traceEvents.occurredAt);

    return NextResponse.json({
      success: true,
      data: {
        events,
        task: { fileName: task.fileName, status: task.status },
        matchedCount: matchedTasks.length,
      },
    });
  } catch (err: any) {
    console.error("Trace 搜索失败:", err);
    return NextResponse.json(
      { success: false, error: err.message || "搜索失败" },
      { status: 500 }
    );
  }
}
