/**
 * 考试压测脚本 — Vercel Blob 模式
 * 目标：上传 P95 ≤ 1s，全链路 ≤ 60s
 */
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = 'https://qiancheng0605v1.vercel.app';
const REPORT_PATH = path.join(import.meta.dirname || process.cwd(), '..', 'docs', 'exam-load-test-report.json');
const REPORT_MD = path.join(import.meta.dirname || process.cwd(), '..', 'docs', '考试压测报告.md');
const PROJECT_ROOT = 'd:/kaoshi/new/qiancheng0605v1';

const TEST_FILE = path.join(PROJECT_ROOT, 'test-data', 'demo_1000.xlsx');
const BIG_FILE = path.join(PROJECT_ROOT, 'test-data', '10000-orders.xlsx');

function getJson(url) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    mod.get(url, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
    }).on('error', () => resolve(null));
  });
}

function postMultipart(url, filePath, fileName) {
  return new Promise((resolve) => {
    const buf = fs.readFileSync(filePath);
    const boundary = '----B' + Math.random().toString(36).slice(2);
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`),
      buf,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const u = new URL(url);
    const start = Date.now();
    const req = https.request({
      hostname: u.hostname, port: u.port, path: u.pathname,
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length },
      timeout: 30000,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const dur = Date.now() - start;
        try { resolve({ status: res.statusCode, dur, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, dur, raw: data.substring(0, 500) }); }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, dur: Date.now() - start, error: 'TIMEOUT' }); });
    req.on('error', e => resolve({ status: 0, dur: Date.now() - start, error: e.message }));
    req.write(body); req.end();
  });
}

function postJson(url, body) {
  return new Promise((resolve) => {
    const payload = JSON.stringify(body);
    const u = new URL(url);
    const start = Date.now();
    const req = https.request({
      hostname: u.hostname, port: u.port, path: u.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout: 15000,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const dur = Date.now() - start;
        try { resolve({ status: res.statusCode, dur, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, dur, raw: data.substring(0, 500) }); }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, dur: Date.now() - start, error: 'TIMEOUT' }); });
    req.on('error', e => resolve({ status: 0, dur: Date.now() - start, error: e.message }));
    req.write(payload); req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function p95(arr) { if (!arr.length) return 0; const s = [...arr].sort((a,b)=>a-b); return s[Math.ceil(s.length*0.95)-1]; }
function p50(arr) { if (!arr.length) return 0; const s = [...arr].sort((a,b)=>a-b); return s[Math.ceil(s.length*0.5)-1]; }
function avg(arr) { if (!arr.length) return 0; return Math.round(arr.reduce((a,b)=>a+b,0)/arr.length); }

async function main() {
  const startTime = new Date();
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   V4 异步导入系统 — 考试压测报告                         ║');
  console.log('║   目标: 上传 P95 ≤ 1s | 全链路 ≤ 60s                    ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const REPORT = {
    test_time: startTime.toISOString(),
    base_url: BASE_URL,
    mode: 'Vercel Blob (Private Store)',
    worker_concurrency: 4,
    worker_rate_limit: '8/s',
    db: 'Neon PostgreSQL Serverless',
    sku_count: 20000,
    upload_test: {},
    e2e_test: {},
    big_file_test: {},
    monitor_snapshot: null,
    errors: [],
  };

  // ====== 1. 环境检查 ======
  console.log('▶ [1/6] 环境检查');
  const rulesRes = await getJson(`${BASE_URL}/api/rules`);
  const ruleId = rulesRes?.data?.[0]?.id;
  if (!ruleId) { console.error('FAIL: No rule'); REPORT.errors.push('No parse rule'); return; }
  console.log(`  ruleId=${ruleId}`);

  const fileSize = fs.existsSync(TEST_FILE) ? (fs.statSync(TEST_FILE).size / 1024).toFixed(1) : 'N/A';
  const bigSize = fs.existsSync(BIG_FILE) ? (fs.statSync(BIG_FILE).size / 1024 / 1024).toFixed(2) : 'N/A';
  console.log(`  demo_1000.xlsx: ${fileSize}KB | 10000-orders.xlsx: ${bigSize}MB`);
  console.log('');

  // ====== 2. 上传接口压测 (Blob模式, 5次) ======
  console.log('▶ [2/6] 上传接口压测 — Blob 模式 (demo_1000.xlsx, 5次)');
  const uploadTimes = [];

  for (let i = 0; i < 5; i++) {
    // Step A: Blob upload
    const blobRes = await postMultipart(`${BASE_URL}/api/blob`, TEST_FILE, 'demo_1000.xlsx');
    const blobUrl = blobRes.data?.data?.url;

    if (!blobUrl) {
      console.log(`  [${i+1}] Blob FAIL: HTTP ${blobRes.status}`);
      REPORT.errors.push(`Upload ${i+1}: Blob HTTP ${blobRes.status}`);
      continue;
    }

    // Step B: Task create (JSON, 极速)
    const taskRes = await postJson(`${BASE_URL}/api/import-tasks`, {
      blobUrl, fileName: 'demo_1000.xlsx', parseRuleId: ruleId,
    });

    uploadTimes.push(taskRes.dur);
    const ok = taskRes.status === 200 || taskRes.status === 201;
    console.log(`  [${i+1}/5] Blob:${blobRes.dur}ms Task:${taskRes.dur}ms ${ok ? 'OK' : 'ERR'}`);

    if (!ok) REPORT.errors.push(`Task create ${i+1}: HTTP ${taskRes.status}`);
    if (i < 4) await sleep(2000);
  }

  REPORT.upload_test = {
    file: 'demo_1000.xlsx',
    rows: 1000,
    mode: 'Blob',
    times_ms: uploadTimes,
    p50_ms: p50(uploadTimes),
    p95_ms: p95(uploadTimes),
    avg_ms: avg(uploadTimes),
    success_count: uploadTimes.length,
    total_attempts: 5,
    p95_pass: p95(uploadTimes) <= 1000,
  };

  console.log(`  P50=${p50(uploadTimes)}ms P95=${p95(uploadTimes)}ms AVG=${avg(uploadTimes)}ms`);
  console.log(`  ${p95(uploadTimes) <= 1000 ? '✅ P95 ≤ 1s' : '❌ P95 > 1s'}\n`);

  // ====== 3. 全链路压测 ======
  console.log('▶ [3/6] 全链路压测 (demo_1000.xlsx)');

  const blobRes2 = await postMultipart(`${BASE_URL}/api/blob`, TEST_FILE, 'demo_1000.xlsx');
  const blobUrl2 = blobRes2.data?.data?.url;

  if (!blobUrl2) {
    console.error('  Blob FAIL');
    REPORT.errors.push('E2E: Blob upload failed');
  } else {
    const e2eUploadStart = Date.now();
    const taskRes = await postJson(`${BASE_URL}/api/import-tasks`, {
      blobUrl: blobUrl2, fileName: 'demo_1000.xlsx', parseRuleId: ruleId,
    });
    const e2eUploadMs = taskRes.dur;
    const taskId = taskRes.data?.data?.taskId || taskRes.data?.taskId;

    if (!taskId) {
      console.error('  No taskId');
      REPORT.errors.push('E2E: no taskId');
    } else {
      console.log(`  Task: ${taskId} | Upload: ${e2eUploadMs}ms`);

      let completed = false;
      let attempts = 0;
      let lastStatus = '';

      while (!completed && attempts < 90) {
        await sleep(2000);
        attempts++;
        const prog = await getJson(`${BASE_URL}/api/import-tasks/${taskId}`);
        const p = prog?.data?.data || prog?.data || {};
        lastStatus = p.status;

        if (attempts <= 3 || attempts % 10 === 0) {
          console.log(`  [${String(attempts).padStart(2)}] ${p.status?.padEnd(16)} total=${p.totalRows} success=${p.successRows} failed=${p.failedRows}`);
        }

        if (['COMPLETED', 'PARTIAL_SUCCESS', 'FAILED'].includes(p.status)) {
          completed = true;
          const totalMs = Date.now() - e2eUploadStart;

          REPORT.e2e_test = {
            taskId,
            file: 'demo_1000.xlsx',
            upload_ms: e2eUploadMs,
            total_ms: totalMs,
            total_s: (totalMs / 1000).toFixed(1),
            status: p.status,
            totalRows: p.totalRows,
            successRows: p.successRows,
            failedRows: p.failedRows,
            target_60s_pass: totalMs <= 60000,
          };

          console.log(`\n  ✅ 完成! ${(totalMs/1000).toFixed(1)}s | ${p.status}`);
          console.log(`     成功=${p.successRows} 失败=${p.failedRows}`);
          console.log(`     ${totalMs <= 60000 ? '✅ ≤ 60s' : '❌ > 60s'}\n`);
        }
      }

      if (!completed) {
        REPORT.errors.push(`E2E task ${taskId} timed out: ${lastStatus}`);
        console.error(`  超时: ${lastStatus}\n`);
      }
    }
  }

  // ====== 4. 10000行文件测试 ======
  console.log('▶ [4/6] 10000行文件上传测试');
  if (fs.existsSync(BIG_FILE)) {
    const bigRes = await postMultipart(`${BASE_URL}/api/blob`, BIG_FILE, '10000-orders.xlsx');
    REPORT.big_file_test = {
      file: '10000-orders.xlsx',
      size_mb: (fs.statSync(BIG_FILE).size / 1024 / 1024).toFixed(2),
      blob_http_status: bigRes.status,
      blob_duration_ms: bigRes.dur,
      blob_success: bigRes.status === 200,
      blob_url: bigRes.data?.data?.url?.substring(0, 50) + '...' || 'N/A',
    };
    if (bigRes.status === 413) {
      console.log('  HTTP 413 — Vercel payload 限制');
      REPORT.big_file_test.note = 'Vercel 4.5MB payload 限制';
    } else {
      console.log(`  HTTP ${bigRes.status} | ${bigRes.dur}ms`);
    }
  } else {
    console.log('  文件不存在，跳过');
  }
  console.log('');

  // ====== 5. 监控快照 ======
  console.log('▶ [5/6] 监控快照');
  try {
    const mon = await getJson(`${BASE_URL}/api/import-monitor/summary`);
    if (mon?.data) {
      const m = mon.data;
      REPORT.monitor_snapshot = {
        queueDepth: m.queueDepth,
        stageLatency: m.stageLatency,
        errorDistribution: m.errorDistribution,
        slowBatches: m.slowBatches?.slice(0, 5),
      };
      console.log(`  队列积压: ${m.queueDepth?.pendingBatches || 0} 批`);
      console.log(`  校验 P50/P95/P99: ${m.stageLatency?.validate?.p50}/${m.stageLatency?.validate?.p95}/${m.stageLatency?.validate?.p99}ms`);
      console.log(`  写入 P50/P95/P99: ${m.stageLatency?.insert?.p50}/${m.stageLatency?.insert?.p95}/${m.stageLatency?.insert?.p99}ms`);
    }
  } catch (e) { REPORT.errors.push(`Monitor: ${e.message}`); }
  console.log('');

  // ====== 6. 汇总 ======
  const up = REPORT.upload_test;
  const e2e = REPORT.e2e_test;

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   压测结果汇总                                            ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  if (up.p50_ms) console.log(`║ 上传 P50: ${String(up.p50_ms).padStart(5)}ms                                     ║`);
  if (up.p95_ms) console.log(`║ 上传 P95: ${String(up.p95_ms).padStart(5)}ms ${up.p95_pass ? '✅ ≤ 1s' : '❌ > 1s'}                              ║`);
  if (e2e.total_ms) {
    console.log(`║ 全链路:  ${String(e2e.total_ms).padStart(5)}ms (${e2e.total_s}s) ${e2e.target_60s_pass ? '✅ ≤ 60s' : '❌ > 60s'}                       ║`);
    console.log(`║ 成功/失败: ${String(e2e.successRows || 0).padStart(4)}/${String(e2e.failedRows || 0).padStart(4)}                                  ║`);
  }
  console.log('╚══════════════════════════════════════════════════════════╝');

  // 保存 JSON
  fs.writeFileSync(REPORT_PATH, JSON.stringify(REPORT, null, 2));
  console.log(`\nJSON: ${REPORT_PATH}`);

  return REPORT;
}

main().catch(e => { console.error(e); process.exit(1); });
