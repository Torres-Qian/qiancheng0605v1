// POST /api/import-tasks - 上传文件，创建异步导入任务
// 设计目标：P95 ≤ 1秒
// 优化策略：事务内只写 import_tasks（~50ms），Outbox/batches 异步写入
// 文件存储：使用 base64 存入数据库（兼容 Vercel Serverless 无持久磁盘）
import { NextRequest, NextResponse } from "next/server";
import { createImportTask } from "@/lib/services/import-task.service";
import { countExcelRowsQuick } from "@/lib/engine/readers/excel";
import { getDb } from "@/lib/db";
import { parseRules } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const parseRuleId = formData.get("parseRuleId") as string | null;

    if (!file) {
      return NextResponse.json({ success: false, error: "请上传文件" }, { status: 400 });
    }
    if (!parseRuleId) {
      return NextResponse.json({ success: false, error: "请选择解析规则" }, { status: 400 });
    }

    const fileName = file.name;
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);
    const fileData = fileBuffer.toString("base64");

    const ext = fileName.split(".").pop()?.toLowerCase();

    // 并行执行：预扫描行数 + 查询规则配置（减少串行等待）
    const [totalRowsRaw, ruleCfg] = await Promise.all([
      // 预扫描：Excel 用轻量 XLSX.read（<200ms），其他格式跳过
      (async () => {
        try {
          if (ext === "xlsx" || ext === "xls") {
            return countExcelRowsQuick(arrayBuffer);
          }
          return 0; // 非 Excel 格式不在上传阶段解析
        } catch {
          return 0;
        }
      })(),
      // 规则查询：仅查 headerRow 和 skipBottom 配置
      (async () => {
        try {
          const db = getDb();
          const rules = await db
            .select({ ruleConfig: parseRules.ruleConfig })
            .from(parseRules)
            .where(eq(parseRules.id, parseRuleId))
            .limit(1);
          return rules[0]?.ruleConfig || null;
        } catch {
          return null;
        }
      })(),
    ]);

    // 扣除表头行
    let totalRows = totalRowsRaw;
    if (ruleCfg && totalRows > 0) {
      const headerRow = Number((ruleCfg as any).headerRow) || 1;
      const skipBottom = Number((ruleCfg as any).skipRows?.bottom) || 0;
      const dataRows = totalRows - headerRow - skipBottom;
      if (dataRows > 0) totalRows = dataRows;
    }

    if (totalRows <= 0) {
      return NextResponse.json({ success: false, error: "文件中没有可解析的数据行" }, { status: 400 });
    }

    // 创建任务（仅写 import_tasks 核心记录，Outbox 异步写入不阻塞响应）
    const result = await createImportTask({
      fileName,
      filePath: `db://import_tasks/${fileName}`,
      fileData,
      parseRuleId,
      totalRows,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    console.error("[import-tasks] 创建任务失败:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
