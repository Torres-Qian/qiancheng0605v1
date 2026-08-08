// 查最近任务
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
  // 通过监控查询
  const r = await getJson('https://qiancheng0605v1.vercel.app/api/import-monitor/summary');
  if (r?.data?.slowBatches) {
    console.log('Top slow batches:');
    for (const b of r.data.slowBatches.slice(0, 5)) {
      console.log(`  ${b.taskId} | ${b.fileName} | ${b.totalDurationMs}ms | ${b.processedRows}/${b.totalRows} | ${b.errorCount || 0} errors`);
    }
  }
}

main().catch(console.error);