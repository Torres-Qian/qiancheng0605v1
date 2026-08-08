/**
 * 卡死任务恢复扫描脚本
 * 定时扫描长时间处于 PROCESSING 状态但无进展的批次，重置为 PENDING 等待重新消费
 *
 * 使用: npx tsx scripts/recover-stale.ts
 * 或设置 cron 定时执行
 */

import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, and, sql, lt } from "drizzle-orm";
import { importTaskBatches, importTasks } from "../src/lib/db/schema";

const STALE_TIMEOUT_MS = 5 * 60 * 1000; // 5 分钟超时

async function recoverStaleBatches() {
  if (!process.env.DATABASE_URL) {
    console.error("请设置 DATABASE_URL 环境变量");
    process.exit(1);
  }

  const sqlClient = neon(process.env.DATABASE_URL);
  const db = drizzle(sqlClient, { schema: { importTaskBatches, importTasks } });

  const staleTime = new Date(Date.now() - STALE_TIMEOUT_MS);

  const staleBatches = await db
    .select()
    .from(importTaskBatches)
    .where(
      and(
        eq(importTaskBatches.status, "PROCESSING"),
        lt(importTaskBatches.lockedAt, staleTime),
      ),
    );

  console.log(`[recover] 发现 ${staleBatches.length} 个卡死批次`);

  for (const batch of staleBatches) {
    await db
      .update(importTaskBatches)
      .set({
        status: "PENDING",
        lockedAt: null,
        retryCount: sql`${importTaskBatches.retryCount} + 1`,
      })
      .where(eq(importTaskBatches.id, batch.id));

    console.log(`[recover] 恢复批次: taskId=${batch.taskId} unitId=${batch.unitId} batchIndex=${batch.batchIndex}`);
  }

  // 检查长时间 PENDING 但所有批次都已完成的卡死任务
  const stuckTasks = await db
    .select()
    .from(importTasks)
    .where(
      and(
        eq(importTasks.status, "PROCESSING"),
        lt(importTasks.createdAt, staleTime),
      ),
    );

  for (const task of stuckTasks) {
    const totalBatches = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(importTaskBatches)
      .where(eq(importTaskBatches.taskId, task.id));

    const completedBatches = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(importTaskBatches)
      .where(and(eq(importTaskBatches.taskId, task.id), eq(importTaskBatches.status, "COMPLETED")));

    const total = totalBatches[0]?.count || 0;
    const completed = completedBatches[0]?.count || 0;

    if (completed >= total && total > 0) {
      const finalStatus = task.failedRows === 0 ? "COMPLETED" : "PARTIAL_SUCCESS";
      await db
        .update(importTasks)
        .set({ status: finalStatus, completedAt: new Date() })
        .where(eq(importTasks.id, task.id));
      console.log(`[recover] 修复任务状态: taskId=${task.id} -> ${finalStatus}`);
    }
  }

  console.log("[recover] 卡死任务恢复扫描完成");
  process.exit(0);
}

recoverStaleBatches().catch((err) => {
  console.error("[recover] 执行失败:", err);
  process.exit(1);
});
