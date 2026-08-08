/**
 * Vercel Blob 模式全链路压测
 * 流程：PUT /api/blob → POST /api/import-tasks (JSON) → 轮询完成
 */
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = 'https://qiancheng0605v1.vercel.app';

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
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   Vercel Blob 模式全链路压测                     ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  const projectRoot = 'd:/kaoshi/new/qiancheng0605v1';
  const files = [
    { name: 'demo_1000.xlsx', path: path.join(projectRoot, 'test-data', 'demo_1000.xlsx') },
  ];

  // 获取规则
  const rulesRes = await getJson(`${BASE_URL}/api/rules`);
  const ruleId = rulesRes?.data?.[0]?.id;
  console.log(`Rule ID: ${ruleId}\n`);

  for (const f of files) {
    if (!fs.existsSync(f.path)) { console.log(`File not found: ${f.path}`); continue; }
    const sizeMB = (fs.statSync(f.path).size / 1024 / 1024).toFixed(2);
    console.log(`▶ ${f.name} (${sizeMB}MB)`);

    const uploadTimes = [];
    const taskTimes = [];

    for (let i = 0; i < 5; i++) {
      // Step 1: 上传到 Blob
      const blobRes = await postMultipart(`${BASE_URL}/api/blob`, f.path, f.name);
      const blobUrl = blobRes.data?.data?.url;

      if (!blobUrl) {
        console.log(`  [${i+1}] Blob upload FAIL: HTTP ${blobRes.status} ${JSON.stringify(blobRes.data).substring(0, 100)}`);
        continue;
      }

      // Step 2: 创建任务（JSON body，极速）
      const taskRes = await postJson(`${BASE_URL}/api/import-tasks`, {
        blobUrl,
        fileName: f.name,
        parseRuleId: ruleId,
      });

      const dur = taskRes.dur;
      uploadTimes.push(dur);
      const taskId = taskRes.data?.data?.taskId || taskRes.data?.taskId || 'N/A';

      console.log(`  [${i+1}/5] Blob: ${blobRes.dur}ms | Task: ${dur}ms | taskId=${String(taskId).substring(0, 8)}`);

      if (i < 4) await sleep(2000);
    }

    console.log(`\n  任务创建 P50: ${p50(uploadTimes)}ms | P95: ${p95(uploadTimes)}ms | AVG: ${avg(uploadTimes)}ms`);
    console.log(`  P95 ${p95(uploadTimes) <= 1000 ? '✅ ≤ 1s' : '❌ > 1s'}\n`);
  }
}

main().catch(console.error);
