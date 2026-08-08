import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';

const BASE_URL = 'https://qiancheng0605v1.vercel.app';
const FILE_PATH = 'C:\\Users\\皮桃\\AppData\\Local\\Temp\\codebuddy-dropped-files\\75a9adc6-a16f-4ad9-bb6c-2b1601374a2d\\湖南仓 - 副本.xlsx';

function getJson(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
    }).on('error', () => resolve(null));
  });
}

function upload(url, filePath, ruleId) {
  return new Promise((resolve) => {
    const buf = fs.readFileSync(filePath);
    const boundary = '----B' + Math.random().toString(36).slice(2);
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="\u6e56\u5357\u4ed3.xlsx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`),
      buf,
      Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="parseRuleId"\r\n\r\n${ruleId}\r\n--${boundary}--\r\n`),
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
        catch { resolve({ status: res.statusCode, dur, raw: data }); }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, dur: Date.now() - start, error: 'TIMEOUT' }); });
    req.on('error', e => resolve({ status: 0, dur: Date.now() - start, error: e.message }));
    req.write(body); req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const rulesRes = await getJson(`${BASE_URL}/api/rules`);
  const ruleId = rulesRes?.data?.[0]?.id;
  const result = await upload(`${BASE_URL}/api/import-tasks`, FILE_PATH, ruleId);
  console.log(`Upload: ${result.status} ${result.dur}ms`);
  const taskId = result.data?.data?.taskId || result.data?.taskId;
  console.log(`Task ID: ${taskId}`);

  // 等待处理完成
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    const taskRes = await getJson(`${BASE_URL}/api/import-tasks/${taskId}`);
    const t = taskRes?.data?.data || taskRes?.data || {};
    console.log(`[${i+1}] status=${t.status} totalRows=${t.totalRows} processed=${t.processedRows} success=${t.successRows} failed=${t.failedRows}`);
    if (['COMPLETED', 'PARTIAL_SUCCESS', 'FAILED'].includes(t.status)) break;
  }
}

main().catch(console.error);