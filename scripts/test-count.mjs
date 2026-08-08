import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

const buf = fs.readFileSync(path.resolve("test-data/10000-orders.xlsx"));
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

// 方案A：sheetRows:1
const t1 = Date.now();
const wb1 = XLSX.read(new Uint8Array(ab), { type: "array", sheetRows: 1 });
let total1 = 0;
for (const n of wb1.SheetNames) {
  const ref = wb1.Sheets[n]["!ref"];
  const r = XLSX.utils.decode_range(ref);
  console.log(`[A] sheet=${n} !ref=${ref} rows=${r.e.r - r.s.r + 1}`);
  total1 += r.e.r - r.s.r + 1;
}
console.log(`[A] sheetRows:1 total=${total1} elapsed=${Date.now() - t1}ms`);

// 方案B：dense mode 全量读
const t2 = Date.now();
const wb2 = XLSX.read(new Uint8Array(ab), { type: "array" });
let total2 = 0;
for (const n of wb2.SheetNames) {
  const ref = wb2.Sheets[n]["!ref"];
  const r = XLSX.utils.decode_range(ref);
  total2 += r.e.r - r.s.r + 1;
}
console.log(`[B] full !ref total=${total2} elapsed=${Date.now() - t2}ms`);

// 方案C：bookProps + bookSheets（只解析元数据）
const t3 = Date.now();
const wb3 = XLSX.read(new Uint8Array(ab), { type: "array", bookProps: true, bookSheets: true });
console.log(`[C] bookSheets: sheets=${JSON.stringify(wb3.SheetNames)} elapsed=${Date.now() - t3}ms`);
