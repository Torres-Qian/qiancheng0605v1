/**
 * 压测数据自动准备脚本
 * 1. 清理并生成 20,000 条 SKU 主数据到 sku_master 表
 * 2. 生成 10,000 行运单 Excel 压测文件
 *
 * 使用: npx tsx scripts/seed-data.ts
 * 环境变量: DATABASE_URL
 */

import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, sql } from "drizzle-orm";
import { skuMaster } from "../src/lib/db/schema";
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";

const SKU_COUNT = 20000;
const WAYBILL_COUNT = 10000;
const BATCH_SIZE = 500;
const ILLEGAL_SKU_RATIO = 0.005; // 0.5% 非法 SKU

const RECIPIENT_NAMES = [
  "北京朝阳门店", "上海浦东门店", "深圳南山门店", "广州天河门店", "杭州西湖门店",
  "成都武侯门店", "武汉光谷门店", "南京鼓楼门店", "重庆渝北门店", "西安雁塔门店",
  "长沙岳麓门店", "郑州金水门店", "福州鼓楼门店", "合肥蜀山门店", "南昌东湖门店",
  "济南历下门店", "青岛市南门店", "大连沙河口门店", "厦门思明门店", "苏州姑苏门店",
];

const PHONE_PREFIXES = ["138", "139", "158", "159", "186", "187", "188", "135", "136", "137"];

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPhone(): string {
  const prefix = PHONE_PREFIXES[randInt(0, PHONE_PREFIXES.length - 1)];
  let suffix = "";
  for (let i = 0; i < 8; i++) suffix += randInt(0, 9).toString();
  return prefix + suffix;
}

function randomName(index: number): string {
  return RECIPIENT_NAMES[index % RECIPIENT_NAMES.length];
}

function randomAddress(index: number): string {
  const cities = [
    "北京市朝阳区", "上海市浦东新区", "深圳市南山区", "广州市天河区", "杭州市西湖区",
    "成都市武侯区", "武汉市洪山区", "南京市鼓楼区", "重庆市渝北区", "西安市雁塔区",
  ];
  const streets = ["中关村大街", "南京路", "科技园路", "体育西路", "文三路", "天府大道", "珞喻路", "中山路", "金开大道", "长安南路"];
  const c = cities[index % cities.length];
  const s = streets[index % streets.length];
  return `${c}${s}${randInt(1, 200)}号`;
}

async function seedSkuMaster(db: ReturnType<typeof drizzle>) {
  console.log("[seed] 清理 SKU 主数据...");
  await db.execute(sql`TRUNCATE TABLE sku_master CASCADE`);

  console.log(`[seed] 开始插入 ${SKU_COUNT} 条 SKU 主数据...`);
  const totalBatches = Math.ceil(SKU_COUNT / BATCH_SIZE);

  for (let batch = 0; batch < totalBatches; batch++) {
    const start = batch * BATCH_SIZE;
    const end = Math.min(start + BATCH_SIZE, SKU_COUNT);
    const values: (typeof skuMaster.$inferInsert)[] = [];

    for (let i = start; i < end; i++) {
      const idx = i + 1;
      values.push({
        skuCode: `SKU_${String(idx).padStart(5, "0")}`,
        name: `测试商品_${idx}`,
        spec: `${randInt(1, 50)}${["kg", "g", "L", "ml", "个", "箱"][idx % 6]}`,
        unit: ["kg", "g", "L", "ml", "个", "箱"][idx % 6],
      });
    }

    await db.insert(skuMaster).values(values);
    if ((batch + 1) % 10 === 0) {
      console.log(`[seed] 已插入 ${end} / ${SKU_COUNT} 条 SKU...`);
    }
  }
  console.log(`[seed] SKU 主数据插入完成: ${SKU_COUNT} 条`);
}

function generateExcelFile() {
  console.log(`[seed] 生成 ${WAYBILL_COUNT} 行运单 Excel 压测文件...`);

  const headers = [
    "外部编码",
    "收货门店",
    "收件人姓名",
    "收件人电话",
    "收件人地址",
    "SKU编码",
    "SKU名称",
    "SKU数量",
    "SKU规格",
    "备注",
  ];

  const rows: string[][] = [headers];
  const illegalCount = Math.floor(WAYBILL_COUNT * ILLEGAL_SKU_RATIO);
  const illegalIndices = new Set<number>();
  while (illegalIndices.size < illegalCount) {
    illegalIndices.add(randInt(0, WAYBILL_COUNT - 1));
  }

  const invalidPhones = new Set<number>();
  while (invalidPhones.size < Math.floor(WAYBILL_COUNT * 0.003)) {
    invalidPhones.add(randInt(0, WAYBILL_COUNT - 1));
  }

  for (let i = 0; i < WAYBILL_COUNT; i++) {
    const orderNo = `ORD_${String(i + 1).padStart(6, "0")}`;
    const storeIdx = i % RECIPIENT_NAMES.length;
    const isIllegal = illegalIndices.has(i);

    const skuCode = isIllegal
      ? `INVALID_SKU_${randInt(1, 999)}`
      : `SKU_${String(randInt(1, SKU_COUNT)).padStart(5, "0")}`;

    const phone = invalidPhones.has(i) ? "12345" : randomPhone();

    rows.push([
      orderNo,
      RECIPIENT_NAMES[storeIdx],
      randomName(i),
      phone,
      randomAddress(i),
      skuCode,
      `商品_${skuCode}`,
      String(randInt(1, 100)),
      `${randInt(1, 50)}${["kg", "个", "箱"][i % 3]}`,
      i % 10 === 0 ? "加急" : "",
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = headers.map(() => ({ wch: 20 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "运单数据");

  const outDir = path.resolve(__dirname, "..", "test-data");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, "10000-orders.xlsx");
  XLSX.writeFile(wb, outPath);

  console.log(`[seed] Excel 压测文件已生成: ${outPath}`);
  console.log(`[seed] 总行数: ${WAYBILL_COUNT}, 非法 SKU: ${illegalCount}, 非法电话: ${invalidPhones.size}`);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("[seed] 请设置 DATABASE_URL 环境变量");
    process.exit(1);
  }

  const sql_client = neon(process.env.DATABASE_URL);
  const db = drizzle(sql_client, { schema: { skuMaster } });

  await seedSkuMaster(db);
  generateExcelFile();

  console.log("[seed] 全部完成！");
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed] 执行失败:", err);
  process.exit(1);
});
