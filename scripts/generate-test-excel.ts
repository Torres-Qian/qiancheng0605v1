/**
 * 单独生成 10,000 行压测 Excel（不重跑数据库 seed）
 * 使用: npx tsx scripts/generate-test-excel.ts
 */
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";

const WAYBILL_COUNT = 10000;
const SKU_COUNT = 20000;
const ILLEGAL_SKU_RATIO = 0.005;

const RECIPIENT_NAMES = [
  "北京朝阳门店", "上海浦东门店", "深圳南山门店", "广州天河门店", "杭州西湖门店",
  "成都武侯门店", "武汉光谷门店", "南京鼓楼门店", "重庆渝北门店", "西安雁塔门店",
];
const PHONE_PREFIXES = ["138", "139", "158", "159", "186", "187", "188"];

function randInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randomPhone() {
  const prefix = PHONE_PREFIXES[randInt(0, PHONE_PREFIXES.length - 1)];
  let suffix = "";
  for (let i = 0; i < 8; i++) suffix += randInt(0, 9);
  return prefix + suffix;
}

const headers = ["外部编码", "收货门店", "收件人姓名", "收件人电话", "收件人地址", "SKU编码", "SKU名称", "SKU数量", "SKU规格", "备注"];
const rows: string[][] = [headers];
const illegal = new Set<number>();
while (illegal.size < Math.floor(WAYBILL_COUNT * ILLEGAL_SKU_RATIO)) illegal.add(randInt(0, WAYBILL_COUNT - 1));
const badPhones = new Set<number>();
while (badPhones.size < Math.floor(WAYBILL_COUNT * 0.003)) badPhones.add(randInt(0, WAYBILL_COUNT - 1));

for (let i = 0; i < WAYBILL_COUNT; i++) {
  const orderNo = `ORD_${String(i + 1).padStart(6, "0")}`;
  const skuCode = illegal.has(i) ? `INVALID_SKU_${randInt(1, 999)}` : `SKU_${String(randInt(1, SKU_COUNT)).padStart(5, "0")}`;
  const phone = badPhones.has(i) ? "12345" : randomPhone();
  rows.push([
    orderNo,
    RECIPIENT_NAMES[i % RECIPIENT_NAMES.length],
    `客户_${i}`,
    phone,
    `北京市朝阳区大街${randInt(1, 200)}号`,
    skuCode,
    `商品_${skuCode}`,
    String(randInt(1, 100)),
    `${randInt(1, 50)}kg`,
    i % 10 === 0 ? "加急" : "",
  ]);
}

const ws = XLSX.utils.aoa_to_sheet(rows);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "运单数据");

const outDir = path.resolve(__dirname, "..", "test-data");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "10000-orders.xlsx");
XLSX.writeFile(wb, outPath);

console.log(`[gen] Excel 已生成: ${outPath}`);
console.log(`[gen] 行数(含表头): ${rows.length}, 非法SKU: ${illegal.size}, 非法电话: ${badPhones.size}`);
