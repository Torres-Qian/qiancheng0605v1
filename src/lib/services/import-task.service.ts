/**
 * 导入任务服务层
 * 创建任务、查询进度、错误查询、批次性能查询
 */

import { getDb } from "../db";
import { importTasks, importTaskBatches, importTaskErrors, batchPerformanceLog, eventOutbox, traceEvents } from "../db/schema";
import { eq, and, desc, sql, asc, like, count, gte } from "drizzle-orm";
import { generateTraceId, generateTaskId, generateUnitId } from "../utils/trace";
import { ImportTaskCreateResult } from "@/types/import-task";

const BATCH_SIZE = 1000;

export interface CreateTaskParams {
  fileName: string;
  filePath: string;
  fileData?: string;
  parseRuleId: string;
  totalRows: number;
}

export async function createImportTask(params: CreateTaskParams): Promise<ImportTaskCreateResult> {
  const { fileName, filePath, fileData, parseRuleId, totalRows } = params;
  const db = getDb();

  const taskId = generateTaskId();
  const traceId = generateTraceId();
  const totalBatches = Math.ceil(totalRows / BATCH_SIZE);

  // 优化：事务内只写入 import_tasks 核心记录，确保任务创建快速返回
  // Outbox / batches / trace_events 在事务外异步写入，不阻塞响应
  await db.insert(importTasks).values({
    id: taskId,
    fileName,
    filePath,
    fileData: fileData || null,
    parseRuleId,
    status: "PENDING",
    totalRows,
    totalBatches,
    traceId,
  });

  // 异步写入 Outbox + batches + trace_events（不阻塞 HTTP 响应）
  // 使用 setImmediate 确保在当前 tick 后异步执行
  setImmediate(async () => {
    try {
      // 构造 Outbox + 批次记录
      const outboxValues: typeof eventOutbox.$inferInsert[] = [];
      const batchValues: typeof importTaskBatches.$inferInsert[] = [];
      const now = new Date().toISOString();
      for (let i = 0; i < totalBatches; i++) {
        const unitId = generateUnitId(i);
        const startRow = i * BATCH_SIZE;
        const endRow = Math.min(startRow + BATCH_SIZE - 1, totalRows - 1);
        outboxValues.push({
          aggregateId: taskId,
          eventType: "ImportBatchCreated",
          payload: {
            event_id: `evt_${taskId}_${i}`,
            event_type: "ImportBatchCreated",
            schema_version: 1,
            aggregate_id: taskId,
            trace_id: traceId,
            occurred_at: now,
            payload: {
              taskId,
              unitId,
              batchIndex: i,
              startRow,
              endRow,
              filePath,
              parseRuleId,
              traceId,
            },
          },
          status: "pending",
        });
        batchValues.push({
          taskId,
          unitId,
          batchIndex: i,
          startRow,
          endRow,
          status: "PENDING",
        });
      }

      // 分片写入
      const CHUNK = 200;
      for (let i = 0; i < outboxValues.length; i += CHUNK) {
        await db.insert(eventOutbox).values(outboxValues.slice(i, i + CHUNK));
      }
      for (let i = 0; i < batchValues.length; i += CHUNK) {
        await db.insert(importTaskBatches).values(batchValues.slice(i, i + CHUNK));
      }

      // Trace 事件
      await db.insert(traceEvents).values([
        {
          traceId, taskId,
          eventName: "ImportTaskCreated",
          eventStatus: "SUCCESS",
          message: `导入任务已创建: ${fileName}, 总行数: ${totalRows}, 批次数: ${totalBatches}`,
        },
        {
          traceId, taskId,
          eventName: "OutboxEventsCreated",
          eventStatus: "SUCCESS",
          message: `已创建 ${totalBatches} 个 Outbox 事件`,
        },
      ]);
    } catch (e) {
      console.error(`[import-task] 异步写入 Outbox 失败: taskId=${taskId}`, e);
    }
  });

  return { taskId, traceId, status: "PENDING", totalRows, totalBatches };
}

export async function getTaskProgress(taskId: string) {
  const db = getDb();
  const result = await db.select().from(importTasks).where(eq(importTasks.id, taskId)).limit(1);

  if (result.length === 0) return null;

  const task = result[0];
  const elapsed = task.createdAt ? (Date.now() - new Date(task.createdAt).getTime()) / 1000 : 0;
  const throughput = elapsed > 0 && task.processedRows > 0 ? Math.round(task.processedRows / elapsed) : 0;
  const remaining = throughput > 0 && task.totalRows > task.processedRows
    ? Math.round((task.totalRows - task.processedRows) / throughput)
    : 0;

  return {
    taskId: task.id,
    fileName: task.fileName,
    traceId: task.traceId,
    status: task.status,
    totalRows: task.totalRows,
    processedRows: task.processedRows,
    successRows: task.successRows,
    failedRows: task.failedRows,
    totalBatches: task.totalBatches,
    completedBatches: task.completedBatches,
    degraded: task.degraded,
    degradedReason: task.degradedReason,
    throughput,
    estimatedRemaining: remaining,
    createdAt: task.createdAt?.toISOString(),
    completedAt: task.completedAt?.toISOString(),
  };
}

export async function getTaskErrors(
  taskId: string,
  options?: { batchIndex?: number; errorCode?: string; page?: number; pageSize?: number },
) {
  const db = getDb();
  const { batchIndex, errorCode, page = 1, pageSize = 50 } = options || {};

  const conditions = [eq(importTaskErrors.taskId, taskId)];

  if (batchIndex !== undefined) {
    conditions.push(eq(importTaskErrors.batchIndex, batchIndex));
  }
  if (errorCode) {
    conditions.push(eq(importTaskErrors.errorCode, errorCode));
  }

  const [rows, totalCount] = await Promise.all([
    db
      .select()
      .from(importTaskErrors)
      .where(and(...conditions))
      .orderBy(asc(importTaskErrors.batchIndex), asc(importTaskErrors.rowNumber))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ count: count() })
      .from(importTaskErrors)
      .where(and(...conditions)),
  ]);

  return {
    errors: rows,
    total: totalCount[0]?.count || 0,
    page,
    pageSize,
  };
}

export async function getBatchPerformance(taskId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(batchPerformanceLog)
    .where(eq(batchPerformanceLog.taskId, taskId))
    .orderBy(asc(batchPerformanceLog.batchIndex));

  return rows;
}

export async function getTraceEvents(traceId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(traceEvents)
    .where(eq(traceEvents.traceId, traceId))
    .orderBy(asc(traceEvents.occurredAt));

  return rows;
}

export async function recoverStaleTasks(staleTimeoutMs = 300000) {
  const db = getDb();
  const staleTime = new Date(Date.now() - staleTimeoutMs);

  // 查找处理中但超时的批次
  const staleBatches = await db
    .select()
    .from(importTaskBatches)
    .where(
      and(
        eq(importTaskBatches.status, "PROCESSING"),
        sql`${importTaskBatches.lockedAt} < ${staleTime}`,
      ),
    );

  for (const batch of staleBatches) {
    await db
      .update(importTaskBatches)
      .set({ status: "PENDING", lockedAt: null })
      .where(eq(importTaskBatches.id, batch.id));

    console.log(`[recovery] 恢复卡死批次: taskId=${batch.taskId} unitId=${batch.unitId}`);
  }

  return staleBatches.length;
}
