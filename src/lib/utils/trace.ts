/**
 * Trace ID 生成与链路事件记录工具
 */

import { getDb } from "../db";
import { traceEvents } from "../db/schema";

export function generateTraceId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `trace_${timestamp}_${random}`;
}

export function generateTaskId(): string {
  return crypto.randomUUID();
}

export function generateUnitId(batchIndex: number): string {
  return `unit_${String(batchIndex).padStart(4, "0")}`;
}

export async function recordTraceEvent(params: {
  traceId: string;
  taskId?: string;
  unitId?: string;
  eventName: string;
  eventStatus?: string;
  message?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const db = getDb();
    await db.insert(traceEvents).values({
      traceId: params.traceId,
      taskId: params.taskId,
      unitId: params.unitId,
      eventName: params.eventName,
      eventStatus: params.eventStatus || "SUCCESS",
      message: params.message,
      metadata: params.metadata || {},
    });
  } catch (err) {
    console.error(`[trace] 事件记录失败 event=${params.eventName}:`, err);
  }
}
