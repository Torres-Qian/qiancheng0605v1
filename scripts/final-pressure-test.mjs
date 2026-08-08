/**
 * 最终考试压测 - Blob 模式
 * 10000 行文件通过 /api/blob + /api/import-tasks (JSON) 上传
 * 目标：上传 P95 ≤ 1s，全链路 ≤ 60s
 */
import https from 'node:https';
import fs from 'node:fs';

const BASE_URL = 'https://qiancheng0605v1.vercel.app';
// 10000-orders.xlsx 做压测（已压缩到 0.56MB，在 Vercel 4.5MB 限制内）
const testFile = 'd:/kaoshi/new/qiancheng0605v1/test-data/10000-orders.xlsx';
const testFileName = '10000-orders.xlsx';
const BIG_FILE = 'd:/kaoshi/new/qiancheng0605v1/test-data/10000-orders.xlsx';

function getJson(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
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
      timeout: 60000,
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
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   考试压测 — Blob 模式                           ║');
  console.log('║   目标: 上传 P95 ≤ 1s | 全链路 ≤ 60s            ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  const REPORT = {
    test_time: startTime.toISOString(),
    base_url: BASE_URL,
    mode: 'Blob (/api/blob → JSON /api/import-tasks)',
    upload_test: {},
    e2e_test: {},
    monitor_snapshot: null,
    errors: [],
  };

  // 获取规则
  const rulesRes = await getJson(`${BASE_URL}/api/rules`);
  const ruleId = rulesRes?.data?.[0]?.id;
  console.log(`Rule: ${ruleId?.substring(0,8)}...`);

  // ====== 使用 10000-orders.xlsx 压测 ======
  const fileSize = (fs.statSync(testFile).size / 1024).toFixed(1);
  console.log(`File: ${testFileName} (${fileSize}KB)\n`);

  // ====== 上传接口压测 (5次) ======
  console.log('▶ [1/2] 上传接口压测 (5次)');
  const uploadTimes = [];

  for (let i = 0; i < 5; i++) {
    // Step 1: 上传到 Blob
    const blobRes = await postMultipart(`${BASE_URL}/api/blob`, testFile, testFileName);
    if (blobRes.status !== 200 || !blobRes.data?.data?.url) {
      console.log(`  [${i+1}] Blob FAIL: HTTP ${blobRes.status}`);
      REPORT.errors.push(`Upload ${i+1}: Blob HTTP ${blobRes.status}`);
      continue;
    }
    const blobUrl = blobRes.data.data.url;

    // Step 2: 创建任务 (JSON)
    const taskRes = await postJson(`${BASE_URL}/api/import-tasks`, {
      blobUrl, fileName: testFileName, parseRuleId: ruleId,
    });

    uploadTimes.push(taskRes.dur);
    const ok = taskRes.status === 200 || taskRes.status === 201;
    console.log(`  [${i+1}/5] Blob:${blobRes.dur}ms | Task:${taskRes.dur}ms ${ok ? 'OK' : 'ERR'}`);

    if (!ok) REPORT.errors.push(`Task ${i+1}: HTTP ${taskRes.status}`);
    if (i < 4) await sleep(2000);
  }

  REPORT.upload_test = {
    file: testFileName,
    times_ms: uploadTimes,
    p50_ms: p50(uploadTimes),
    p95_ms: p95(uploadTimes),
    avg_ms: avg(uploadTimes),
    p95_pass: p95(uploadTimes) <= 1000,
  };

  console.log(`  P50=${p50(uploadTimes)}ms | P95=${p95(uploadTimes)}ms | AVG=${avg(uploadTimes)}ms`);
  console.log(`  ${p95(uploadTimes) <= 1000 ? '✅ P95 ≤ 1s' : '❌ P95 > 1s'}\n`);

  // ====== 全链路压测 ======
  console.log('▶ [2/2] 全链路压测');
  const blobRes = await postMultipart(`${BASE_URL}/api/blob`, testFile, testFileName);
  if (blobRes.status !== 200 || !blobRes.data?.data?.url) {
    console.error('  Blob FAIL');
    REPORT.errors.push('E2E: Blob failed');
  } else {
    const e2eStart = Date.now();
    const taskRes = await postJson(`${BASE_URL}/api/import-tasks`, {
      blobUrl: blobRes.data.data.url,
      fileName: testFileName,
      parseRuleId: ruleId,
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

      while (!completed && attempts < 180) {
        await sleep(2000);
        attempts++;
        const prog = await getJson(`${BASE_URL}/api/import-tasks/${taskId}`);
        const p = prog?.data?.data || prog?.data || {};
        lastStatus = p.status;

        if (attempts <= 3 || attempts % 15 === 0) {
          console.log(`  [${String(attempts).padStart(3)}] ${p.status?.padEnd(16)} total=${p.totalRows} success=${p.successRows} failed=${p.failedRows}`);
        }

        if (['COMPLETED', 'PARTIAL_SUCCESS', 'FAILED'].includes(p.status)) {
          completed = true;
          const totalMs = Date.now() - e2eStart;
          REPORT.e2e_test = {
            taskId, file: testFileName,
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
          console.log(`     ${totalMs <= 60000 ? '✅ ≤ 60s' : '❌ > 60s'}`);
        }
      }

      if (!completed) {
        REPORT.errors.push(`E2E timeout: ${lastStatus}`);
        console.error(`  超时: ${lastStatus}`);
      }
    }
  }

  // ====== 监控快照 ======
  try {
    const mon = await getJson(`${BASE_URL}/api/import-monitor/summary`);
    if (mon?.data) {
      const m = mon.data;
      REPORT.monitor_snapshot = {
        queueDepth: m.queueDepth,
        stageLatency: m.stageLatency,
        errorDistribution: m.errorDistribution?.slice(0, 5),
      };
    }
  } catch (e) { REPORT.errors.push(`Monitor: ${e.message}`); }

  // ====== 汇总 ======
  const up = REPORT.upload_test;
  const e2e = REPORT.e2e_test;

  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║   压测结果                                        ║');
  console.log('╠══════════════════════════════════════════════════╣');
  if (up.p50_ms) console.log(`║ 上传 P50: ${String(up.p50_ms).padStart(5)}ms                                   ║`);
  if (up.p95_ms) console.log(`║ 上传 P95: ${String(up.p95_ms).padStart(5)}ms ${up.p95_pass ? '✅ ≤ 1s' : '❌ > 1s'}                            ║`);
  if (e2e.total_ms) {
    console.log(`║ 全链路:  ${String(e2e.total_ms).padStart(5)}ms (${e2e.total_s}s) ${e2e.target_60s_pass ? '✅ ≤ 60s' : '❌ > 60s'}                     ║`);
    console.log(`║ 成功/失败: ${String(e2e.successRows || 0).padStart(4)}/${String(e2e.failedRows || 0).padStart(4)}                                ║`);
  }
  console.log('╚══════════════════════════════════════════════════╝');

  const reportPath = 'd:/kaoshi/new/qiancheng0605v1/docs/final-pressure-test.json';
  fs.writeFileSync(reportPath, JSON.stringify(REPORT, null, 2));
  console.log(`\nReport: ${reportPath}`);

  return REPORT;
}

main().catch(e => { console.error(e); process.exit(1); });