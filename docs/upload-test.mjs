import { readFileSync } from "fs";
import { resolve } from "path";
import { request } from "https";
import { createHash } from "crypto";

const BASE = "qiancheng0605v1.vercel.app";
const TEST_FILE = resolve(process.cwd(), "test-data/10000-orders.xlsx");
const PARSE_RULE_ID = "ccfdd79d-5fe4-49db-a40f-31ec06b57138";

function uploadFile() {
  const boundary = "----FormBoundary" + Math.random().toString(36).slice(2);
  const fileBuffer = readFileSync(TEST_FILE);
  const fileName = "10000-orders.xlsx";

  const head = [
    `--${boundary}`,
    `Content-Disposition: form-data; name="file"; filename="${fileName}"`,
    `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`,
    "", "",
  ].join("\r\n");
  const mid = [
    `\r\n--${boundary}`,
    `Content-Disposition: form-data; name="parseRuleId"`,
    "", "",
    PARSE_RULE_ID,
  ].join("\r\n");
  const tail = `\r\n--${boundary}--\r\n`;

  const headBuf = Buffer.from(head, "utf-8");
  const midBuf = Buffer.from(mid, "utf-8");
  const tailBuf = Buffer.from(tail, "utf-8");
  const body = Buffer.concat([headBuf, fileBuffer, midBuf, tailBuf]);

  return new Promise((resolve, reject) => {
    const start = Date.now();
    const req = request({
      hostname: BASE,
      path: "/api/import-tasks",
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": body.length,
      },
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        const ms = Date.now() - start;
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, duration: ms, body: json });
        } catch {
          resolve({ status: res.statusCode, duration: ms, body: data.slice(0, 500) });
        }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function pollTask(taskId) {
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: BASE,
      path: `/api/import-tasks/${taskId}`,
      method: "GET",
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data.slice(0, 200) });
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function main() {
  console.log("=== V4 Compliance Test ===");
  console.log(`Target: https://${BASE}`);
  console.log(`File: 10000-orders.xlsx (10000 rows)`);
  console.log(`Rule: ${PARSE_RULE_ID}`);
  console.log(`Time: ${new Date().toISOString()}\n`);

  // Upload
  console.log("[1] Uploading...");
  const uploadStart = Date.now();
  const uploadResult = await uploadFile();
  const uploadMs = Date.now() - uploadStart;

  console.log(`  Status: ${uploadResult.status}`);
  console.log(`  Duration: ${uploadMs}ms`);

  const taskId = uploadResult.body?.data?.taskId;
  const traceId = uploadResult.body?.data?.traceId;

  if (!taskId) {
    console.error("FAIL: No taskId returned");
    console.log("Response:", JSON.stringify(uploadResult.body).slice(0, 500));
    return;
  }

  console.log(`  TaskId: ${taskId}`);
  console.log(`  TraceId: ${traceId}`);
  console.log(`  Upload P95≤1s: ${uploadMs}ms → ${uploadMs <= 1000 ? "PASS" : "FAIL"}`);

  // Poll
  console.log(`\n[2] Polling task status...`);
  const taskStart = Date.now();
  let done = false;

  for (let i = 0; i < 180 && !done; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const pr = await pollTask(taskId);
    const d = pr.body?.data || {};

    const s = d.status || "?";
    console.log(`  [${String(i + 1).padStart(3)}] ${s} | ${d.processedRows || 0}/${d.totalRows || 0} | ok=${d.successRows || 0} fail=${d.failedRows || 0} | batch ${d.completedBatches || 0}/${d.totalBatches || 0}`);

    if (["COMPLETED", "PARTIAL_SUCCESS", "FAILED"].includes(s)) {
      done = true;
      const totalMs = Date.now() - taskStart;
      const pass = totalMs <= 60000;

      console.log(`\n=== RESULT ===`);
      console.log(`  Status: ${s}`);
      console.log(`  Total rows: ${d.totalRows}`);
      console.log(`  Success: ${d.successRows}`);
      console.log(`  Failed: ${d.failedRows}`);
      console.log(`  Duration: ${totalMs}ms (${(totalMs / 1000).toFixed(1)}s)`);
      console.log(`  10000 rows ≤ 60s: ${pass ? "PASS" : "FAIL"}`);
      console.log(`  Degraded: ${d.degraded ? "YES" : "NO"}`);
    }
  }

  if (!done) console.log("TIMEOUT - task did not complete in 6 minutes");
}

main().catch(e => { console.error(e); process.exit(1); });
