// 直接调用 /api/import-tasks 上传 10000 行 Excel，测算 P95 与总耗时
import fs from "node:fs";
import path from "node:path";

const RULE_ID = "ccfdd79d-5fe4-49db-a40f-31ec06b57138";
const FILE = path.resolve("test-data/10000-orders.xlsx");
const BASE = "http://localhost:3000";

async function upload() {
  const buf = fs.readFileSync(FILE);
  const form = new FormData();
  form.append("file", new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), path.basename(FILE));
  form.append("parseRuleId", RULE_ID);

  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/import-tasks`, { method: "POST", body: form });
  const t1 = Date.now();
  const json = await res.json();
  return { latencyMs: t1 - t0, json };
}

async function pollProgress(taskId, timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = await fetch(`${BASE}/api/import-tasks/${taskId}`);
    const j = await r.json();
    const t = j.data;
    if (!t) {
      await new Promise((r) => setTimeout(r, 500));
      continue;
    }
    console.log(`[poll] status=${t.status} processed=${t.processedRows}/${t.totalRows} success=${t.successRows} failed=${t.failedRows} batches=${t.completedBatches}/${t.totalBatches}`);
    if (t.status === "COMPLETED" || t.status === "PARTIAL_SUCCESS" || t.status === "FAILED") {
      return { finishMs: Date.now() - start, task: t };
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return { finishMs: -1, task: null };
}

(async () => {
  // 上传 5 次，取 P50/P95
  const latencies = [];
  const tasks = [];
  for (let i = 0; i < 5; i++) {
    const { latencyMs, json } = await upload();
    console.log(`[upload#${i + 1}] latency=${latencyMs}ms success=${json.success} taskId=${json.data?.taskId} totalBatches=${json.data?.totalBatches}`);
    latencies.push(latencyMs);
    if (json.success) tasks.push(json.data.taskId);
  }
  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || latencies[latencies.length - 1];
  console.log(`\n[upload latency] samples=${latencies.length} min=${latencies[0]} p50=${p50} p95=${p95} max=${latencies.at(-1)}`);

  // 只测第一个任务的端到端完成耗时
  if (tasks[0]) {
    console.log(`\n[e2e] 开始等待任务 ${tasks[0]} 完成…`);
    const startWait = Date.now();
    const { finishMs, task } = await pollProgress(tasks[0], 180000);
    console.log(`\n[e2e] taskId=${tasks[0]} 完成耗时=${finishMs}ms 状态=${task?.status} success=${task?.successRows} failed=${task?.failedRows}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
