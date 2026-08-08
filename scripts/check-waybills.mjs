// 查询demo_1000相关的运单
import https from 'node:https';

function getJson(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
    }).on('error', () => resolve(null));
  });
}

async function main() {
  // 总数
  const r1 = await getJson('https://qiancheng0605v1.vercel.app/api/waybills?page=1&pageSize=1');
  console.log('Total waybills:', r1?.data?.totalCount);

  // 1000行文件有 ~1000条数据，最大单号 ~ PSHZ26xxxxxxxxx
  // 取所有数据看看
  let allData = [];
  for (let p = 1; p <= 10; p++) {
    const r = await getJson(`https://qiancheng0605v1.vercel.app/api/waybills?page=${p}&pageSize=100`);
    if (r?.data?.data) allData.push(...r.data.data);
    else break;
  }
  console.log('Fetched:', allData.length, 'records');

  // 按sourceFile分组
  const grouped = {};
  for (const w of allData) {
    const sf = w.sourceFile || 'unknown';
    grouped[sf] = (grouped[sf] || 0) + 1;
  }
  console.log('Source files:');
  for (const [k, v] of Object.entries(grouped)) {
    console.log(`  ${k}: ${v}`);
  }
}

main().catch(console.error);