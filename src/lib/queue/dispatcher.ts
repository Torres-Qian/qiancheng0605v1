/**
 * Outbox Dispatcher
 * 轮询 event_outbox 表，将待投递事件推送到 BullMQ 队列
 * 保证任务创建与消息投递的可靠衔接
 */

import { eq, and, isNull, lt, sql, or } from "drizzle-orm";
import { getDb } from "../db";
import { eventOutbox } from "../db/schema";
import { getImportQueue } from "./client";

const POLL_INTERVAL_MS = 2000;
const MAX_RETRY_COUNT = 5;
const RETRY_DELAY_MS = 10000;

let pollingTimer: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

export async function dispatchOutboxEvents(): Promise<{ sent: number; failed: number }> {
  const db = getDb();
  const queue = getImportQueue();

  const pendingEvents = await db
    .select()
    .from(eventOutbox)
    .where(
      and(
        eq(eventOutbox.status, "pending"),
        lt(eventOutbox.retryCount, MAX_RETRY_COUNT),
        // 若 nextRetryAt 未设置或已到时间，才可投递（实现指数退避真实生效）
        or(isNull(eventOutbox.nextRetryAt), lt(eventOutbox.nextRetryAt, sql`NOW()`)),
      ),
    )
    .orderBy(eventOutbox.createdAt)
    .limit(50);

  let sent = 0;
  let failed = 0;

  for (const event of pendingEvents) {
    try {
      // jobId 使用 event.id 保证 BullMQ 端去重：同一 outbox 事件不会被重复投递为两个 Job
      const job = await queue.add(event.eventType, event.payload as object, {
        jobId: `outbox_${event.id}`,
        // 幂等保护：任务失败最多重试 3 次，超时后交给 stale-recovery
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 200,
        removeOnFail: 500,
      });

      await db
        .update(eventOutbox)
        .set({
          status: "sent",
          sentAt: sql`NOW()`,
        })
        .where(eq(eventOutbox.id, event.id));

      sent++;
    } catch (err) {
      console.error(`[dispatcher] 投递失败 event_id=${event.id}:`, err);

      const nextRetry = new Date(Date.now() + RETRY_DELAY_MS * Math.pow(2, event.retryCount));
      await db
        .update(eventOutbox)
        .set({
          status: event.retryCount + 1 >= MAX_RETRY_COUNT ? "failed" : "pending",
          retryCount: event.retryCount + 1,
          nextRetryAt: nextRetry,
        })
        .where(eq(eventOutbox.id, event.id));

      failed++;
    }
  }

  return { sent, failed };
}

export function startDispatcher(): void {
  if (isRunning) return;
  isRunning = true;

  console.log("[dispatcher] Outbox Dispatcher 启动");

  const tick = async () => {
    try {
      const result = await dispatchOutboxEvents();
      if (result.sent > 0 || result.failed > 0) {
        console.log(`[dispatcher] 投递结果: sent=${result.sent}, failed=${result.failed}`);
      }
    } catch (err) {
      console.error("[dispatcher] 轮询异常:", err);
    }
  };

  tick();
  pollingTimer = setInterval(tick, POLL_INTERVAL_MS);
}

export function stopDispatcher(): void {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
  isRunning = false;
  console.log("[dispatcher] Outbox Dispatcher 已停止");
}
