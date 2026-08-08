// POST /api/import-tasks - 上传文件，创建异步导入任务
// 设计目标：P95 ≤ 1秒（小文件达标）
// 实现：
//   1. 并行：预扫描行数 + DB 规则查询（XLSX 预扫描 < 50ms for 小文件）
//   2. 事务内只写 import_tasks，Outbox 异步写入
//   3. fileData 用 base64 存入 text 字段
import { NextRequest, NextResponse } from "next/server";
import { createImportTask } from "@/lib/services/import-task.service";
import { countExcelRowsQuick } from "@/lib/engine/readers/excel";
import { getDb } from "@/lib/db";
import { importTasks, parseRules } from "@/lib/db/schema";
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
    const ext = fileName.split(".").pop()?.toLowerCase();
    const arrayBuffer = await file.arrayBuffer();

    // 并行：预扫描行数（仅 xlsx）+ 查询规则配置（获取 headerRow/skipRows）
    const [rawRowCount, ruleCfg] = await Promise.all([
      (async () => {
        if (ext !== "xlsx" && ext !== "xls") return 0;
        try {
          return countExcelRowsQuick(arrayBuffer);
        } catch {
          return 0;
        }
      })(),
      (async () => {
        try {
          const db = getDb();
          const rules = await db
            .select({ ruleConfig: parseRules.ruleConfig })
            .from(parseRules)
            .where(eq(parseRules.id, parseRuleId))
            .limit(1);
          return (rules[0]?.ruleConfig as any) || null;
        } catch {
          return null;
        }
      })(),
    ]);

    // 扣除表头行
    let totalRows = rawRowCount;
    if (ruleCfg && totalRows > 0) {
      const headerRow = Number(ruleCfg.headerRow) || 1;
      const skipBottom = Number(ruleCfg.skipRows?.bottom) || 0;
      const dataRows = totalRows - headerRow - skipBottom;
      if (dataRows > 0) totalRows = dataRows;
    }
    if (totalRows <= 0) totalRows = 1; // 至少 1 行（保险）

    // 创建任务（事务内只写 import_tasks，Outbox 异步）
    const result = await createImportTask({
      fileName,
      filePath: `db://import_tasks/${fileName}`,
      parseRuleId,
      totalRows,
    });

    // 同步读取并 base64 编码文件数据
    const fileData = Buffer.from(arrayBuffer).toString("base64");
    const db = getDb();
    await db.update(importTasks).set({ fileData }).where(eq(importTasks.id, result.taskId));

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    console.error("[import-tasks] 创建任务失败:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
