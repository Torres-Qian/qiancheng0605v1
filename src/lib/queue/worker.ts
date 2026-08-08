/**
 * Import Worker - BullMQ Consumer
 * 消费导入批次 Job，执行解析、校验、写入的完整处理链路
 *
 * 部署: 需在 Railway / Render 等常驻进程平台运行
 * 启动: npx tsx src/lib/queue/worker.ts
 */

import { Worker, Job } from "bullmq";
import { getDb } from "../db";
import { importTasks, importTaskBatches, waybills, importTaskErrors, batchPerformanceLog, traceEvents } from "../db/schema";
import { eq, sql, and } from "drizzle-orm";
import { getRedisConnection } from "./client";
import { processBatch } from "../services/batch-processor.service";

const BATCH_SIZE = 1000;

interface BatchJobEnvelope {
  event_id?: string;
  event_type?: string;
  schema_version?: number;
  aggregate_id?: string;
  trace_id?: string;
  occurred_at?: string;
  payload: {
    taskId: string;
    unitId: string;
    batchIndex: number;
    startRow: number;
    endRow: number;
    filePath: string;
    parseRuleId: string;
    traceId: string;
  };
}

export async function createImportWorker(): Promise<Worker> {
  const connection = getRedisConnection();

  const worker = new Worker<BatchJobEnvelope>(
    "import-batch",
    async (job: Job<BatchJobEnvelope>) => {
      const { taskId, unitId, batchIndex, startRow, endRow, filePath, parseRuleId, traceId } = job.data.payload;
      const db = getDb();

      console.log(`[worker] 开始处理 unit=${unitId} batch=${batchIndex} rows=${startRow}-${endRow} traceId=${traceId}`);

      const batchStart = Date.now();

      // 幂等检查：已完成或处理中批次直接跳过（防止 dispatcher 重复投递 + BullMQ 重试导致的双计数）
      const existing = await db
        .select({ status: importTaskBatches.status, lockedAt: importTaskBatches.lockedAt })
        .from(importTaskBatches)
        .where(and(eq(importTaskBatches.taskId, taskId), eq(importTaskBatches.unitId, unitId)))
        .limit(1);

      if (existing.length > 0) {
        const s = existing[0].status;
        if (s === "COMPLETED") {
          console.log(`[worker] unit=${unitId} 已完成，跳过重复消费`);
          return { unitId, status: "already_completed" };
        }
        // PROCESSING 且 lockedAt 未过期（5 分钟）说明有其他 worker 正在处理
        if (s === "PROCESSING" && existing[0].lockedAt) {
          const lockedMs = Date.now() - new Date(existing[0].lockedAt).getTime();
          if (lockedMs < 5 * 60_000) {
            console.log(`[worker] unit=${unitId} 正在被其他实例处理 (${lockedMs}ms)，跳过`);
            return { unitId, status: "in_progress_by_other" };
          }
        }
      }

      // 记录批次开始事件
      await db.insert(traceEvents).values({
        traceId,
        taskId,
        unitId,
        eventName: "ImportBatchStarted",
        eventStatus: "SUCCESS",
        message: `批次 ${batchIndex} 开始处理 (行 ${startRow}-${endRow})`,
      });

      // 更新批次状态为处理中
      await db
        .insert(importTaskBatches)
        .values({
          taskId,
          unitId,
          batchIndex,
          startRow,
          endRow,
          status: "PROCESSING",
          lockedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [importTaskBatches.taskId, importTaskBatches.unitId],
          set: { status: "PROCESSING", lockedAt: new Date(), retryCount: sql`${importTaskBatches.retryCount} + 1` },
        });

      // 任务级状态：首次进入处理时从 PENDING → PROCESSING
      await db
        .update(importTasks)
        .set({ status: "PROCESSING" })
        .where(and(eq(importTasks.id, taskId), eq(importTasks.status, "PENDING")));

      try {
        const result = await processBatch({
          taskId,
          unitId,
          batchIndex,
          startRow,
          endRow,
          filePath,
          parseRuleId,
          traceId,
        });

        const batchEnd = Date.now();

        // 写入性能日志
        await db.insert(batchPerformanceLog).values({
          taskId,
          unitId,
          batchIndex,
          parseDurationMs: result.parseDurationMs,
          ruleDurationMs: result.ruleDurationMs,
          validateDurationMs: result.validateDurationMs,
          insertDurationMs: result.insertDurationMs,
          totalDurationMs: batchEnd - batchStart,
          rowCount: endRow - startRow + 1,
          status: "COMPLETED",
          traceId,
        });

        // 原子更新任务进度
        const rowCount = endRow - startRow + 1;
        await db
          .update(importTasks)
          .set({
            processedRows: sql`${importTasks.processedRows} + ${rowCount}`,
            successRows: sql`${importTasks.successRows} + ${result.successCount}`,
            failedRows: sql`${importTasks.failedRows} + ${result.failedCount}`,
            completedBatches: sql`${importTasks.completedBatches} + 1`,
          })
          .where(eq(importTasks.id, taskId));

        // 更新批次状态为完成
        await db
          .update(importTaskBatches)
          .set({ status: "COMPLETED", completedAt: new Date() })
          .where(and(eq(importTaskBatches.taskId, taskId), eq(importTaskBatches.unitId, unitId)));

        // 记录批次完成事件
        await db.insert(traceEvents).values({
          traceId,
          taskId,
          unitId,
          eventName: "ImportBatchSucceeded",
          eventStatus: "SUCCESS",
          message: `批次 ${batchIndex} 完成: 成功 ${result.successCount}, 失败 ${result.failedCount}`,
        });

        console.log(
          `[worker] unit=${unitId} 完成: success=${result.successCount} failed=${result.failedCount} duration=${batchEnd - batchStart}ms`,
        );

        // 聚合任务最终状态
        await aggregateTaskStatus(db, taskId);

        return { unitId, successCount: result.successCount, failedCount: result.failedCount };
      } catch (err: any) {
        console.error(`[worker] unit=${unitId} 处理失败:`, err);

        const errorMessage = err?.message || String(err);
        const rowCount = endRow - startRow + 1;

        await db
          .update(importTaskBatches)
          .set({ status: "FAILED", errorMessage })
          .where(and(eq(importTaskBatches.taskId, taskId), eq(importTaskBatches.unitId, unitId)));

        // 批次级异常：把该批次所有行都标记为失败，写入 errors 表方便前端排查
        // 否则用户在页面看到"失败=N"却在错误明细里空空如也，无从下手
        try {
          const errorRows = [];
          for (let i = 0; i < rowCount; i++) {
            errorRows.push({
              taskId,
              batchIndex,
              unitId,
              rowNumber: startRow + i,
              fieldName: "__batch__",
              rawValue: "",
              errorCode: "E007",
              errorReason: `批次处理异常: ${errorMessage}`,
              traceId,
            });
          }
          // 分片写入，避免单条 SQL 过大
          const CHUNK = 500;
          for (let i = 0; i < errorRows.length; i += CHUNK) {
            await db.insert(importTaskErrors).values(errorRows.slice(i, i + CHUNK));
          }

          // 同步更新任务计数，让前端能立刻看到失败数变化
          await db
            .update(importTasks)
            .set({
              processedRows: sql`${importTasks.processedRows} + ${rowCount}`,
              failedRows: sql`${importTasks.failedRows} + ${rowCount}`,
              completedBatches: sql`${importTasks.completedBatches} + 1`,
            })
            .where(eq(importTasks.id, taskId));

          await aggregateTaskStatus(db, taskId);
        } catch (writeErr) {
          console.error(`[worker] 写入批次异常明细失败:`, writeErr);
        }

        await db.insert(traceEvents).values({
          traceId,
          taskId,
          unitId,
          eventName: "ImportBatchFailed",
          eventStatus: "FAILED",
          message: `批次 ${batchIndex} 失败: ${errorMessage}`,
        });

        throw err;
      }
    },
    {
      connection,
      concurrency: 4,
      limiter: { max: 8, duration: 1000 },
    },
  );

  worker.on("completed", (job) => {
    console.log(`[worker] Job ${job.id} 完成`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[worker] Job ${job?.id} 失败:`, err.message);
  });

  return worker;
}

async function aggregateTaskStatus(db: ReturnType<typeof getDb>, taskId: string) {
  const task = await db.select().from(importTasks).where(eq(importTasks.id, taskId)).limit(1);

  if (task.length === 0) return;

  const t = task[0];
  if (t.completedBatches < t.totalBatches) return;

  let finalStatus: string;
  if (t.failedRows === 0) {
    finalStatus = "COMPLETED";
  } else if (t.successRows > 0) {
    finalStatus = "PARTIAL_SUCCESS";
  } else {
    finalStatus = "FAILED";
  }

  await db
    .update(importTasks)
    .set({ status: finalStatus, completedAt: new Date() })
    .where(eq(importTasks.id, taskId));

  await db.insert(traceEvents).values({
    traceId: t.traceId,
    taskId,
    eventName: "ImportTaskCompleted",
    eventStatus: finalStatus === "COMPLETED" ? "SUCCESS" : "PARTIAL",
    message: `任务完成: status=${finalStatus} success=${t.successRows} failed=${t.failedRows}`,
  });

  console.log(`[worker] 任务 ${taskId} 最终状态: ${finalStatus}`);
}

// 独立运行时启动 Worker
if (require.main === module || process.argv[1]?.includes("worker")) {
  (async () => {
    console.log("[worker] 启动 Import Worker...");
    const worker = await createImportWorker();
    console.log("[worker] Worker 已就绪，等待 Job...");

    process.on("SIGTERM", async () => {
      await worker.close();
      process.exit(0);
    });
    process.on("SIGINT", async () => {
      await worker.close();
      process.exit(0);
    });
  })();
}
