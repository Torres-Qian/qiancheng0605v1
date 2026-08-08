// 测试 Worker 是否能访问 Blob URL
import https from 'node:https';

const url = 'https://6c3egij5bfmeculj.private.blob.vercel-storage.com/demo_1000-6Fhq2KdM0FbG2DrV0hZTO3CGZN1wNV.xlsx';

function fetchWithToken(blobUrl, token) {
  return new Promise((resolve) => {
    https.get(blobUrl, { headers: { Authorization: `Bearer ${token}` } }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, len: data.length, prefix: data.substring(0, 30) }));
    }).on('error', e => resolve({ error: e.message }));
  });
}

function fetchNoToken(blobUrl) {
  return new Promise((resolve) => {
    https.get(blobUrl, (res) => {
      resolve({ status: res.statusCode });
    }).on('error', e => resolve({ error: e.message }));
  });
}

async function main() {
  console.log('=== 测试 Blob URL 访问 ===\n');
  console.log('URL:', url.substring(0, 80) + '...\n');

  // 无 token
  const noToken = await fetchNoToken(url);
  console.log('无 Token:', noToken);

  // 带 token（从 .env 读）
  const { config } = await import('dotenv');
  config({ path: 'd:/kaoshi/new/qiancheng0605v1/.env' });
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  console.log('Token:', token?.substring(0, 20) + '...');

  if (token) {
    const withToken = await fetchWithToken(url, token);
    console.log('带 Token:', withToken);
  }
}

main().catch(console.error);