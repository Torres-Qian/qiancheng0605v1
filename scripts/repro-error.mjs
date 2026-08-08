import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';

const BASE_URL = 'https://qiancheng0605v1.vercel.app';
const FILE_PATH = 'C:\\Users\\皮桃\\AppData\\Local\\Temp\\codebuddy-dropped-files\\7310f23c-c192-47c4-b9bf-191e238fb02e\\湖南仓 - 副本.xlsx';

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

async function main() {
  const rulesRes = await getJson(`${BASE_URL}/api/rules`);
  const ruleId = rulesRes?.data?.[0]?.id;
  const result = await upload(`${BASE_URL}/api/import-tasks`, FILE_PATH, ruleId);
  console.log(`Status: ${result.status}, Duration: ${result.dur}ms`);

  // 只显示错误消息的前300字符
  const err = result.data?.error || result.raw || '';
  console.log('--- Error ---');
  console.log(err.substring(0, 300));
}

main().catch(console.error);