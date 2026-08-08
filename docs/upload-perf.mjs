import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getJson(url) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    mod.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve({}); }
      });
    }).on('error', () => resolve({}));
  });
}

async function upload(filePath, label, ruleId) {
  const fileBuffer = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);
  const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);

  const parts = [];
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`));
  parts.push(fileBuffer);
  parts.push(Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="parseRuleId"\r\n\r\n${ruleId}\r\n--${boundary}--\r\n`));
  const body = Buffer.concat(parts);

  const u = new URL('https://qiancheng0605v1.vercel.app/api/import-tasks');
  const start = Date.now();
  const result = await new Promise((resolve) => {
    const req = https.request({
      hostname: u.hostname, port: u.port, path: u.pathname,
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length },
      timeout: 30000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    });
    req.on('timeout', () => { req.destroy(); resolve({ statusCode: 0, body: 'TIMEOUT' }); });
    req.on('error', (e) => resolve({ statusCode: 0, body: e.message }));
    req.write(body);
    req.end();
  });
  const duration = Date.now() - start;

  console.log(`[${label}] Status: ${result.statusCode} | Time: ${duration}ms`);
  let parsed = {};
  try { parsed = JSON.parse(result.body); } catch (e) { }
  console.log(`[${label}] Response keys: ${Object.keys(parsed).join(', ')}`);
  if (parsed.success) {
    console.log(`[${label}] Task ID: ${parsed.data?.id || parsed.taskId || 'N/A'}`);
  } else {
    console.log(`[${label}] Error: ${parsed.error || result.body.substring(0, 200)}`);
  }
  console.log(`[${label}] ${duration <= 1000 ? '✓ PASS (<=1s)' : '✗ FAIL (>1s)'}`);
  console.log('');
  return { duration, statusCode: result.statusCode, parsed };
}

async function main() {
  console.log('=== 上传接口响应时间检查 ===\n');

  // 获取规则
  const rulesRes = await getJson('https://qiancheng0605v1.vercel.app/api/rules');
  const rules = rulesRes.data || rulesRes || [];
  const ruleId = rules[0]?.id || '';
  console.log(`Rule ID: ${ruleId}\n`);

  // 测试1行文件
  const r1 = await upload(path.join(__dirname, '..', 'test-data', 'small-test.xlsx'), '1-row', ruleId);

  // 分析结果
  console.log('=== 总结 ===');
  if (r1.statusCode === 200 || r1.statusCode === 201) {
    console.log(`上传接口响应时间: ${r1.duration}ms — ${r1.duration <= 1000 ? '符合要求' : '不符合要求（>1s）'}`);
  } else {
    console.log(`上传接口返回错误: HTTP ${r1.statusCode}`);
  }
}

main().catch(console.error);
