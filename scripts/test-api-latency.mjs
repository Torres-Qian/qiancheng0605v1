/**
 * 精确延迟拆解：POST /api/import-tasks (Legacy模式)
 */
import https from 'node:https';
import fs from 'node:fs';

const BASE_URL = 'https://qiancheng0605v1.vercel.app';
const FILE = 'd:/kaoshi/new/qiancheng0605v1/test-data/demo_1000.xlsx';
const FILE2 = 'd:/kaoshi/new/qiancheng0605v1/test-data/demo_200.xlsx';

function getRuleId() {
  return new Promise((resolve) => {
    https.get(`${BASE_URL}/api/rules`, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d).data[0].id); } catch { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

function upload(filePath, ruleId, label) {
  return new Promise((resolve) => {
    const buf = fs.readFileSync(filePath);
    const boundary = '----B' + Math.random().toString(36).slice(2);
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filePath.split('/').pop()}"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`),
      buf,
      Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="parseRuleId"\r\n\r\n${ruleId}\r\n--${boundary}--\r\n`),
    ]);

    const u = new URL(`${BASE_URL}/api/import-tasks`);
    const sizeKB = (buf.length / 1024).toFixed(1);
    const start = Date.now();
    const req = https.request({
      hostname: u.hostname, port: u.port, path: u.pathname,
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length },
      timeout: 15000,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const dur = Date.now() - start;
        try {
          const json = JSON.parse(data);
          resolve({ label, sizeKB, status: res.statusCode, dur, taskId: json.data?.taskId?.substring(0,8), rows: json.data?.totalRows });
        } catch {
          resolve({ label, sizeKB, status: res.statusCode, dur, error: data.substring(0, 100) });
        }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ label, sizeKB, status: 0, dur: Date.now() - start, error: 'TIMEOUT' }); });
    req.on('error', e => resolve({ label, sizeKB, status: 0, dur: Date.now() - start, error: e.message }));
    req.write(body); req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('=== /api/import-tasks 延迟拆解 ===\n');

  const ruleId = await getRuleId();
  if (!ruleId) { console.error('No rule'); return; }
  console.log(`Rule: ${ruleId.substring(0,8)}...\n`);

  // 预热
  console.log('Warmup...');
  await upload(FILE2, ruleId, 'warmup');
  await sleep(1000);

  // 测试 200 行文件
  const results200 = [];
  for (let i = 0; i < 3; i++) {
    const r = await upload(FILE2, ruleId, `200rows`);
    results200.push(r);
    console.log(`  [${i+1}] ${r.sizeKB}KB | ${r.dur}ms | HTTP${r.status} | taskId=${r.taskId} | rows=${r.rows}`);
    if (i < 2) await sleep(1000);
  }

  console.log('');

  // 测试 1000 行文件
  const results1000 = [];
  for (let i = 0; i < 3; i++) {
    const r = await upload(FILE, ruleId, `1000rows`);
    results1000.push(r);
    console.log(`  [${i+1}] ${r.sizeKB}KB | ${r.dur}ms | HTTP${r.status} | taskId=${r.taskId} | rows=${r.rows}`);
    if (i < 2) await sleep(1000);
  }

  console.log('\n=== 汇总 ===');
  const avg200 = results200.reduce((a,b) => a + b.dur, 0) / results200.length;
  const avg1000 = results1000.reduce((a,b) => a + b.dur, 0) / results1000.length;
  console.log(`200行 (${results200[0]?.sizeKB}KB): P50=${results200.sort((a,b)=>a.dur-b.dur)[1]?.dur}ms, AVG=${Math.round(avg200)}ms`);
  console.log(`1000行 (${results1000[0]?.sizeKB}KB): P50=${results1000.sort((a,b)=>a.dur-b.dur)[1]?.dur}ms, AVG=${Math.round(avg1000)}ms`);
}

main().catch(console.error);