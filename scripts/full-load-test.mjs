/**
 * 全链路压测脚本 V2
 * 应对 Vercel 4.5MB 限制：
 *   - 先用 demo_1000.xlsx (1000行, 0.45MB) 做上传+全链路验证
 *   - 10000行文件单独做 413 确认，并在报告中说明
 */

import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = 'https://qiancheng0605v1.vercel.app';

function httpGet(url) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    mod.get(url, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, data: null, raw: data }); }
      });
    }).on('error', e => resolve({ status: 0, error: e.message }));
  });
}

function httpPost(url, body, boundary) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request({
      hostname: u.hostname, port: u.port, path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 30000,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data), raw: data }); }
        catch (e) { resolve({ status: res.statusCode, data: null, raw: data }); }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, error: 'TIMEOUT' }); });
    req.on('error', (e) => resolve({ status: 0, error: e.message }));
    req.write(body);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function p95(arr) { if (!arr.length) return 0; const s = [...arr].sort((a,b)=>a-b); return s[Math.ceil(s.length*0.95)-1]; }
function p50(arr) { if (!arr.length) return 0; const s = [...arr].sort((a,b)=>a-b); return s[Math.ceil(s.length*0.5)-1]; }
function avg(arr) { if (!arr.length) return 0; return Math.round(arr.reduce((a,b)=>a+b,0)/arr.length); }

function buildMultipart(filePath, ruleId) {
  const buf = fs.readFileSync(filePath);
  const name = path.basename(filePath);
  const b = '----Boundary' + Math.random().toString(36).slice(2);
  const parts = [
    Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`),
    buf,
    Buffer.from(`\r\n--${b}\r\nContent-Disposition: form-data; name="parseRuleId"\r\n\r\n${ruleId}\r\n--${b}--\r\n`)
  ];
  return { body: Buffer.concat(parts), boundary: b };
}

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   V4 异步导入系统 — 全链路压测 V2              ║');
  console.log('║   BASE_URL: https://qiancheng0605v1.vercel.app   ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  const REPORT = {
    test_time: new Date().toISOString(),
    base_url: BASE_URL,
    worker_count: 2,
    worker_concurrency: 4,
    db_type: 'Neon PostgreSQL Serverless',
    sku_count: 20000,
    notes: [],
    upload_p95_test: {},
    e2e_test: {},
    big_file_test: {},
    monitor_snapshot: null,
    errors: [],
  };

  // ---- Step 1: 获取规则 ----
  console.log('▶ [1/6] 获取解析规则');
  const rulesRes = await httpGet(`${BASE_URL}/api/rules`);
  const ruleId = rulesRes.data?.data?.[0]?.id;
  if (!ruleId) { console.error('FAIL'); REPORT.errors.push('No rule found'); return; }
  console.log(`  rule_id: ${ruleId}\n`);

  // ====== Part A: 上传 P95 测试 (demo_1000.xlsx, 1000行, 0.45MB) ======
  console.log('▶ [2/6] 上传 P95 测试 — demo_1000.xlsx (1000行, 0.45MB)');
  const smallFile = path.join(__dirname, '..', 'test-data', 'demo_1000.xlsx');
  if (!fs.existsSync(smallFile)) {
    console.error('  FAIL: demo_1000.xlsx not found');
    REPORT.errors.push('demo_1000.xlsx not found');
  } else {
    const { body, boundary } = buildMultipart(smallFile, ruleId);
    const uploadTimes = [];

    for (let i = 0; i < 5; i++) {
      const start = Date.now();
      const res = await httpPost(`${BASE_URL}/api/import-tasks`, body, boundary);
      const dur = Date.now() - start;
      uploadTimes.push(dur);

      const ok = res.status === 200 || res.status === 201;
      const taskId = res.data?.data?.taskId || res.data?.data?.id || '';
      console.log(`  [${i + 1}/5] ${ok ? 'OK' : 'ERR'} HTTP ${res.status} | ${dur}ms | taskId=${taskId.substring(0, 8)}...`);

      if (i < 4) await sleep(2000);
    }

    REPORT.upload_p95_test = {
      file: 'demo_1000.xlsx',
      rows: 1000,
      file_size_mb: (fs.statSync(smallFile).size / 1024 / 1024).toFixed(2),
      times_ms: uploadTimes,
      p50_ms: p50(uploadTimes),
      p95_ms: p95(uploadTimes),
      avg_ms: avg(uploadTimes),
      p95_pass: p95(uploadTimes) <= 1000,
    };

    console.log(`  P50=${p50(uploadTimes)}ms, P95=${p95(uploadTimes)}ms, AVG=${avg(uploadTimes)}ms`);
    console.log(`  ${p95(uploadTimes) <= 1000 ? '✅ P95 ≤ 1s' : '❌ P95 > 1s'}\n`);
  }

  // ====== Part B: 全链路测试 (demo_1000.xlsx) ======
  console.log('▶ [3/6] 全链路测试 — demo_1000.xlsx');

  const { body: e2eBody, boundary: e2eBoundary } = buildMultipart(smallFile, ruleId);
  const uploadStart = Date.now();
  const uploadRes = await httpPost(`${BASE_URL}/api/import-tasks`, e2eBody, e2eBoundary);
  const uploadEnd = Date.now();

  if (uploadRes.status !== 200 && uploadRes.status !== 201) {
    console.error(`  Upload failed: HTTP ${uploadRes.status}`);
    REPORT.errors.push(`E2E upload failed: HTTP ${uploadRes.status}`);
  } else {
    const taskData = uploadRes.data?.data || uploadRes.data || {};
    const taskId = taskData.taskId || taskData.id;

    if (!taskId) {
      console.error('  No taskId in response');
      REPORT.errors.push('E2E: no taskId');
    } else {
      console.log(`  Upload: ${uploadEnd - uploadStart}ms, taskId=${taskId}`);

      // 轮询
      const taskStart = Date.now();
      let completed = false;
      let attempts = 0;
      let lastStatus = '';

      while (!completed && attempts < 90) {
        await sleep(2000);
        attempts++;

        const progRes = await httpGet(`${BASE_URL}/api/import-tasks/${taskId}`);
        const prog = progRes.data?.data || progRes.data || {};
        const status = prog.status;
        lastStatus = status;

        if (attempts <= 3 || attempts % 10 === 0) {
          console.log(`  [${String(attempts).padStart(2)}] ${status.padEnd(16)} processed=${prog.processedRows || 0}/${prog.totalRows || '?'}  success=${prog.successRows || 0}  failed=${prog.failedRows || 0}`);
        }

        if (['COMPLETED', 'PARTIAL_SUCCESS', 'FAILED'].includes(status)) {
          completed = true;
          const taskEnd = Date.now();
          const totalMs = taskEnd - taskStart;

          REPORT.e2e_test = {
            file: 'demo_1000.xlsx',
            taskId,
            upload_ms: uploadEnd - uploadStart,
            total_ms: totalMs,
            total_seconds: (totalMs / 1000).toFixed(1),
            status,
            totalRows: prog.totalRows,
            successRows: prog.successRows,
            failedRows: prog.failedRows,
            processedRows: prog.processedRows,
            degraded: prog.degraded || false,
            target_60s_pass: totalMs <= 60000,
          };

          console.log(`\n  ✅ 完成! 总耗时: ${(totalMs/1000).toFixed(1)}s`);
          console.log(`     状态: ${status}  成功: ${prog.successRows}  失败: ${prog.failedRows}`);
          console.log(`     ${totalMs <= 60000 ? '✅ ≤ 60s' : '❌ > 60s'}\n`);
        }
      }

      if (!completed) {
        console.error(`  Task 超时 (3min), 最后状态: ${lastStatus}`);
        REPORT.errors.push(`E2E task ${taskId} timed out`);
        REPORT.e2e_test = { taskId, status: lastStatus, timed_out: true };
      }
    }
  }

  // ====== Part C: 10000行文件测试（验证413） ======
  console.log('▶ [4/6] 10000行文件上传测试');
  const bigFile = path.join(__dirname, '..', 'test-data', '10000-orders.xlsx');
  if (!fs.existsSync(bigFile)) {
    console.error('  FAIL: 10000-orders.xlsx not found');
    REPORT.errors.push('10000-orders.xlsx not found');
  } else {
    const { body: bigBody, boundary: bigBoundary } = buildMultipart(bigFile, ruleId);
    const bigStart = Date.now();
    const bigRes = await httpPost(`${BASE_URL}/api/import-tasks`, bigBody, bigBoundary);
    const bigDur = Date.now() - bigStart;

    REPORT.big_file_test = {
      file: '10000-orders.xlsx',
      rows: 10000,
      file_size_mb: (fs.statSync(bigFile).size / 1024 / 1024).toFixed(2),
      multipart_size_mb: (bigBody.length / 1024 / 1024).toFixed(2),
      http_status: bigRes.status,
      duration_ms: bigDur,
    };

    if (bigRes.status === 413) {
      console.log(`  HTTP 413 — Vercel 4.5MB payload 限制 (${(bigBody.length / 1024 / 1024).toFixed(2)} MB > 4.5 MB)`);
      REPORT.big_file_test.note = 'Vercel payload 限制 4.5MB，10000行文件含 multipart 开销后超限';
    } else {
      console.log(`  HTTP ${bigRes.status} — ${bigDur}ms`);
    }
    console.log('');
  }

  // ====== Part D: 监控快照 ======
  console.log('▶ [5/6] 监控快照');
  try {
    const mon = await httpGet(`${BASE_URL}/api/import-monitor/summary`);
    if (mon.status === 200 && mon.data) {
      const m = mon.data.data || mon.data;
      REPORT.monitor_snapshot = {
        queueDepth: m.queueDepth,
        stageLatency: m.stageLatency,
        errorDistribution: m.errorDistribution,
        slowBatches: m.slowBatches,
      };
      console.log(`  队列积压: ${m.queueDepth?.pendingBatches || 0} 批`);
      console.log(`  校验 P50/P95/P99: ${m.stageLatency?.validate?.p50 || 0}/${m.stageLatency?.validate?.p95 || 0}/${m.stageLatency?.validate?.p99 || 0}ms`);
      console.log(`  写入 P50/P95/P99: ${m.stageLatency?.insert?.p50 || 0}/${m.stageLatency?.insert?.p95 || 0}/${m.stageLatency?.insert?.p99 || 0}ms`);
    }
  } catch (e) { REPORT.errors.push(`Monitor: ${e.message}`); }
  console.log('');

  // ====== Part E: 汇总 ======
  console.log('▶ [6/6] 汇总\n');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   压测结果汇总                                   ║');
  console.log('╠══════════════════════════════════════════════════╣');

  const up = REPORT.upload_p95_test;
  const e2e = REPORT.e2e_test;

  if (up.p95_ms) {
    console.log(`║ 上传 P95: ${String(up.p95_ms).padStart(5)}ms ${up.p95_pass ? '✅ ≤ 1s' : '❌ > 1s'}        ║`);
  }
  if (e2e.total_ms) {
    console.log(`║ 全链路:  ${String(e2e.total_ms).padStart(5)}ms (${e2e.total_seconds}s) ${e2e.target_60s_pass ? '✅ ≤ 60s' : '❌ > 60s'}   ║`);
    console.log(`║ 成功行:  ${String(e2e.successRows || 0).padStart(5)}  失败行: ${String(e2e.failedRows || 0).padStart(4)}               ║`);
  }
  console.log('╠══════════════════════════════════════════════════╣');

  const bigFileResult = REPORT.big_file_test;
  if (bigFileResult.http_status === 413) {
    console.log(`║ ⚠ 10000行文件: HTTP 413 (Vercel限制)            ║`);
  }

  if (REPORT.errors.length > 0) {
    console.log(`║ 错误: ${REPORT.errors.length} 项                              ║`);
  }
  console.log('╚══════════════════════════════════════════════════╝');

  // 保存
  const outPath = path.join(__dirname, '..', 'docs', 'load-test-report.json');
  fs.writeFileSync(outPath, JSON.stringify(REPORT, null, 2));
  console.log(`\n报告: ${outPath}`);

  return REPORT;
}

main().catch(err => { console.error(err); process.exit(1); });
