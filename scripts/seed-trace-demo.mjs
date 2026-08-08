/**
 * 全链路追踪演示数据生成脚本
 * 上传 3 个不同规模的 Excel，等待处理完成，输出 traceId/taskId 供前端验证
 *
 * 用法: node scripts/seed-trace-demo.mjs
 */
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

const BASE = "http://localhost:3000";
const RULE_ID = "ccfdd79d-5fe4-49db-a40f-31ec06b57138";

const HEADERS = ["外部编码", "收货门店", "收件人姓名", "收件人电话", "收件人地址", "SKU编码", "SKU名称", "SKU数量", "SKU规格", "备注"];
const STORES = ["北京朝阳门店", "上海浦东门店", "深圳南山门店", "广州天河门店", "杭州西湖门店"];
const PHONES = ["13812345678", "13987654321", "15811112222", "18633334444", "18799998888"];

function makeRows(count, label, injectErrors = false) {
  const rows = [HEADERS];
  for (let i = 0; i < count; i++) {
    const isErrSku = injectErrors && i % 20 === 0;
    const isErrPhone = injectErrors && i % 30 === 0;
    rows.push([
      `${label}_ORD_${String(i + 1).padStart(5, "0")}`,
      STORES[i % STORES.length],
      `客户${i + 1}号`,
      isErrPhone ? "12345" : PHONES[i % PHONES.length],
      `北京市朝阳区测试路${i + 1}号`,
      isErrSku ? `BAD_SKU_${i}` : `SKU_${String((i % 500) + 1).padStart(5, "0")}`,
      `商品名称_${i + 1}`,
      String((i % 50) + 1),
      "标准",
      i % 5 === 0 ? "加急" : "",
    ]);
  }
  return rows;
}

function buildExcel(rows, fileName) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "数据");
  const tmpDir = path.resolve("test-data");
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const tmpPath = path.join(tmpDir, fileName);
  XLSX.writeFile(wb, tmpPath);
  return tmpPath;
}

async function upload(filePath, label) {
  const buf = fs.readFileSync(filePath);
  const form = new FormData();
  form.append(
    "file",
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    path.basename(filePath),
  );
  form.append("parseRuleId", RULE_ID);
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/import-tasks`, { method: "POST", body: form });
  const json = await res.json();
  const latency = Date.now() - t0;
  if (!json.success) throw new Error(`[${label}] 上传失败: ${JSON.stringify(json)}`);
  return { ...json.data, latency };
}

async function poll(taskId, label, timeoutMs = 120_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const r = await fetch(`${BASE}/api/import-tasks/${taskId}`);
    const j = await r.json();
    const t = j.data;
    if (!t) { await sleep(1000); continue; }
    process.stdout.write(`\r[${label}] status=${t.status.padEnd(16)} processed=${String(t.processedRows || 0).padStart(5)}/${t.totalRows} success=${t.successRows || 0} failed=${t.failedRows || 0}  `);
    if (["COMPLETED", "PARTIAL_SUCCESS", "FAILED"].includes(t.status)) {
      process.stdout.write("\n");
      return { finishMs: Date.now() - t0, task: t };
    }
    await sleep(2000);
  }
  process.stdout.write("\n");
  return { finishMs: -1, task: null };
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

const CASES = [
  { label: "小批量-10行", count: 10, errors: true },
  { label: "中批量-200行", count: 200, errors: true },
  { label: "大批量-1000行", count: 1000, errors: true },
];

console.log("=".repeat(70));
console.log("  全链路 Trace 演示数据生成");
console.log("=".repeat(70));

const results = [];

for (const c of CASES) {
  console.log(`\n[构建] ${c.label}...`);
  const rows = makeRows(c.count, c.label.split("-")[0], c.errors);
  const tmpFile = buildExcel(rows, `demo_${c.count}.xlsx`);
  console.log(`[上传] ${c.label} (${rows.length - 1} 数据行)...`);
  const up = await upload(tmpFile, c.label);
  console.log(`[上传完成] latency=${up.latency}ms taskId=${up.taskId} traceId=${up.traceId} totalBatches=${up.totalBatches}`);
  results.push({ ...c, taskId: up.taskId, traceId: up.traceId });
}

console.log("\n[等待所有任务处理完成...]\n");

const finals = [];
for (const r of results) {
  const { finishMs, task } = await poll(r.taskId, r.label);
  finals.push({ ...r, finishMs, task });
}

console.log("\n" + "=".repeat(70));
console.log("  处理结果汇总");
console.log("=".repeat(70));

for (const f of finals) {
  const t = f.task;
  console.log(`\n▶ ${f.label}`);
  console.log(`  taskId   : ${f.taskId}`);
  console.log(`  traceId  : ${f.traceId}`);
  console.log(`  状态     : ${t?.status ?? "超时"}`);
  console.log(`  成功/失败: ${t?.successRows ?? "?"}/${t?.failedRows ?? "?"}`);
  console.log(`  耗时     : ${f.finishMs > 0 ? (f.finishMs / 1000).toFixed(1) + "s" : "超时"}`);
}

console.log("\n" + "=".repeat(70));
console.log("  前端验证方式");
console.log("=".repeat(70));
console.log("\n打开 http://localhost:3000/traces，在搜索框中输入以下任意值:\n");
for (const f of finals) {
  console.log(`  [Trace ID] ${f.traceId}`);
  console.log(`  [Task ID]  ${f.taskId}`);
}
console.log(`\n  [文件名搜索] 输入 "demo_" 可以批量匹配`);
console.log(`  [错误码搜索] 输入 "E001" 可以找到所有 SKU 校验失败的记录`);
console.log(`  [错误码搜索] 输入 "E003" 可以找到所有电话号码校验失败的记录`);
console.log(`  [批次号搜索] 输入 "0" 可以找到所有任务的第一批次`);
console.log("\n" + "=".repeat(70));
