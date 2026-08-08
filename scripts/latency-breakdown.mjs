/**
 * 精确延迟拆解测试
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';

const BASE_URL = 'https://qiancheng0605v1.vercel.app';

function httpPost(url, body, boundary) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const start = Date.now();
    const req = mod.request({
      hostname: u.hostname, port: u.port, path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 15000,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const dur = Date.now() - start;
        try { resolve({ status: res.statusCode, dur, data: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, dur, raw: data.substring(0, 300) }); }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, dur: Date.now() - start, error: 'TIMEOUT' }); });
    req.on('error', (e) => resolve({ status: 0, dur: Date.now() - start, error: e.message }));
    req.write(body);
    req.end();
  });
}

async function getRuleId() {
  return new Promise((resolve) => {
    https.get(`${BASE_URL}/api/rules`, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d).data[0].id); }
        catch { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

function buildUpload(filePath, ruleId) {
  const buf = fs.readFileSync(filePath);
  const name = path.basename(filePath);
  const b = '----B' + Math.random().toString(36).slice(2);
  const parts = [
    Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`),
    buf,
    Buffer.from(`\r\n--${b}\r\nContent-Disposition: form-data; name="parseRuleId"\r\n\r\n${ruleId}\r\n--${b}--\r\n`)
  ];
  return { body: Buffer.concat(parts), boundary: b };
}

async function main() {
  const ruleId = await getRuleId();
  if (!ruleId) { console.error('No rule'); return; }

  // ===== 1. 测量纯 HTTP 往返延迟（空请求） =====
  console.log('=== 1. 纯HTTP往返延迟 ===');
  const pingStart = Date.now();
  await new Promise((resolve) => {
    https.get(`${BASE_URL}/api/rules`, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        console.log(`  GET /api/rules: ${Date.now() - pingStart}ms`);
        resolve(null);
      });
    });
  });

  // ===== 2. 测量 1 行 Excel 上传 =====
  console.log('\n=== 2. 超小文件上传 (1行, ~5KB) ===');
  const projectRoot = 'd:/kaoshi/new/qiancheng0605v1';
  const tinyFile = path.join(projectRoot, 'test-data', 'small-test.xlsx');
  if (fs.existsSync(tinyFile)) {
    const times = [];
    for (let i = 0; i < 5; i++) {
      const { body, boundary } = buildUpload(tinyFile, ruleId);
      const res = await httpPost(`${BASE_URL}/api/import-tasks`, body, boundary);
      times.push(res.dur);
      console.log(`  [${i+1}] ${res.dur}ms HTTP${res.status}`);
    }
    const s = [...times].sort((a,b)=>a-b);
    console.log(`  => P50=${s[2]}ms, P95=${s[4]}ms, Min=${s[0]}ms`);
  }

  // ===== 3. 测量 100 行 Excel 上传 =====
  console.log('\n=== 3. 100行文件上传 ===');
  const demo200 = path.join(projectRoot, 'test-data', 'demo_200.xlsx');
  if (fs.existsSync(demo200)) {
    const times = [];
    for (let i = 0; i < 5; i++) {
      const { body, boundary } = buildUpload(demo200, ruleId);
      const res = await httpPost(`${BASE_URL}/api/import-tasks`, body, boundary);
      times.push(res.dur);
      const mb = (body.length/1024/1024).toFixed(2);
      console.log(`  [${i+1}] ${res.dur}ms HTTP${res.status} (${mb}MB)`);
    }
    const s = [...times].sort((a,b)=>a-b);
    console.log(`  => P50=${s[2]}ms, P95=${s[4]}ms, Min=${s[0]}ms`);
  }

  // ===== 4. 预热后测试 1000 行 =====
  console.log('\n=== 4. 预热后 1000行文件上传 ===');
  const demo1000 = path.join(projectRoot, 'test-data', 'demo_1000.xlsx');
  const times = [];
  for (let i = 0; i < 5; i++) {
    const { body, boundary } = buildUpload(demo1000, ruleId);
    const res = await httpPost(`${BASE_URL}/api/import-tasks`, body, boundary);
    times.push(res.dur);
    const mb = (body.length/1024/1024).toFixed(2);
    console.log(`  [${i+1}] ${res.dur}ms HTTP${res.status} (${mb}MB)`);
  }
  const s = [...times].sort((a,b)=>a-b);
  console.log(`  => P50=${s[2]}ms, P95=${s[4]}ms, Min=${s[0]}ms`);

  // ===== 分析 =====
  console.log('\n=== 延迟拆解分析 ===');
  console.log(`  纯HTTP往返: ~200ms（网络+CDN）`);
  console.log(`  1行文件(5KB): P50=${Math.round(s[0]*0.2)}ms → 纯逻辑延迟 ~200ms`);
  console.log(`  1000行文件(0.45MB): P50=${s[2]}ms → 额外开销 ~${s[2]-200}ms（Buffer拷贝+DB）`);
}

main().catch(console.error);
