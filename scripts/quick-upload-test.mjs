/**
 * 快速上传延迟测试 — 使用 tiny Excel 文件排除网络/CPU开销
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
        catch (e) { resolve({ status: res.statusCode, dur, raw: data.substring(0, 200) }); }
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

  const projectRoot = 'd:/kaoshi/new/qiancheng0605v1';
  const files = [
    { name: '10-rows (5KB)', path: path.join(projectRoot, 'test-data', 'small-test.xlsx') },
    { name: '1000-rows (0.45MB)', path: path.join(projectRoot, 'test-data', 'demo_1000.xlsx') },
  ];

  for (const f of files) {
    if (!fs.existsSync(f.path)) { console.log(`${f.name}: file not found`); continue; }
    const size = (fs.statSync(f.path).size / 1024).toFixed(1);

    const times = [];
    for (let i = 0; i < 3; i++) {
      const { body, boundary } = buildUpload(f.path, ruleId);
      const res = await httpPost(`${BASE_URL}/api/import-tasks`, body, boundary);
      times.push(res.dur);
      console.log(`${f.name} [${i+1}/3]: ${res.dur}ms HTTP${res.status} (file ${size}KB, body ${(body.length/1024).toFixed(1)}KB)`);
    }

    const sorted = [...times].sort((a,b)=>a-b);
    console.log(`  => P50=${sorted[1]}ms, Min=${sorted[0]}ms, Max=${sorted[2]}ms\n`);
  }
}

main().catch(console.error);
