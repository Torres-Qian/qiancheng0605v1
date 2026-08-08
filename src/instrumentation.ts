/**
 * Next.js Instrumentation Hook
 * 在 Node.js 服务实例启动时拉起后台任务：
 *   1. Outbox Dispatcher —— 轮询 event_outbox，把 pending 事件投递到 BullMQ 队列
 *   2. Import Worker —— 消费队列 Job，执行批次解析/校验/写入
 *
 * 若未启动这两个进程，导入任务会永远停留在 PENDING（"等待处理"）。
 */

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // 使用 globalThis 作幂等保护，避免 HMR / 多次 register 重复启动
  const g = globalThis as unknown as { __importRuntimeStarted?: boolean };
  if (g.__importRuntimeStarted) return;
  g.__importRuntimeStarted = true;

  const { startDispatcher } = await import("./lib/queue/dispatcher");
  const { createImportWorker } = await import("./lib/queue/worker");

  try {
    startDispatcher();
    await createImportWorker();
    console.log("[instrumentation] Dispatcher 与 Worker 已启动");
  } catch (err) {
    console.error("[instrumentation] 后台任务启动失败:", err);
    g.__importRuntimeStarted = false;
  }
}
