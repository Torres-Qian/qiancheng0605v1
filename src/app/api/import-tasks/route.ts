// POST /api/import-tasks - 上传文件，创建异步导入任务
// 设计目标：P95 ≤ 1秒（Vercel 边缘网络环境）；本地冷启动放宽到 8 秒
// 文件存储：使用 base64 存入数据库（兼容 Vercel Serverless 无持久磁盘）
import { NextRequest, NextResponse } from "next/server";
import { createImportTask } from "@/lib/services/import-task.service";
import { readFileFromBuffer } from "@/lib/engine";
import { countExcelRowsQuick } from "@/lib/engine/readers/excel";
import { getDb } from "@/lib/db";
import { parseRules } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const UPLOAD_TIMEOUT_MS = 8000;

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

    // 预扫描总行数
    let totalRows = 0;
    try {
      const ext = fileName.split(".").pop()?.toLowerCase();
      if (ext === "xlsx" || ext === "xls") {
        totalRows = countExcelRowsQuick(arrayBuffer);
      } else {
        const scanResult = await Promise.race([
          (async () => {
            const rawData = await readFileFromBuffer(arrayBuffer, fileName);
            return rawData.rows.length;
          })(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("文件预扫描超时")), UPLOAD_TIMEOUT_MS * 0.5),
          ),
        ]);
        totalRows = scanResult;
      }
    } catch (err: any) {
      return NextResponse.json(
        { success: false, error: `文件解析失败: ${err.message}，请检查文件格式或缩小文件大小` },
        { status: 400 }
      );
    }

    if (totalRows === 0) {
      return NextResponse.json({ success: false, error: "文件中没有可解析的数据行" }, { status: 400 });
    }

    // 扣除表头行
    try {
      const db = getDb();
      const rules = await db
        .select({ ruleConfig: parseRules.ruleConfig })
        .from(parseRules)
        .where(eq(parseRules.id, parseRuleId))
        .limit(1);
      const cfg: any = rules[0]?.ruleConfig;
      if (cfg) {
        const headerRow = Number(cfg.headerRow) || 1;
        const skipBottom = Number(cfg.skipRows?.bottom) || 0;
        const dataRows = totalRows - headerRow - skipBottom;
        if (dataRows > 0) totalRows = dataRows;
      }
    } catch (e) {
      console.warn("[import-tasks] 扣除表头失败，使用原始行数:", e);
    }

    // 创建导入任务，传入 base64 文件数据
    try {
      const result = await Promise.race([
        createImportTask({
          fileName,
          filePath: `db://import_tasks/${fileName}`,
          fileData,
          parseRuleId,
          totalRows,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("创建任务超时，请重试")), UPLOAD_TIMEOUT_MS)
        ),
      ]);

      return NextResponse.json({
        success: true,
        data: result,
      });
    } catch (timeoutErr: any) {
      return NextResponse.json(
        { success: false, error: timeoutErr.message || "创建任务超时，请重试" },
        { status: 503 }
      );
    }
  } catch (err: any) {
    console.error("[import-tasks] 创建任务失败:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
