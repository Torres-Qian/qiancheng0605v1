// POST /api/import-tasks - 上传文件，创建异步导入任务
// 设计目标：P95 ≤ 1秒（Vercel 边缘网络环境）；本地冷启动放宽到 8 秒
import { NextRequest, NextResponse } from "next/server";
import { createImportTask } from "@/lib/services/import-task.service";
import { generateTraceId } from "@/lib/utils/trace";
import { readFileFromBuffer } from "@/lib/engine";
import { countExcelRowsQuick } from "@/lib/engine/readers/excel";
import { getDb } from "@/lib/db";
import { parseRules } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

const UPLOAD_TIMEOUT_MS = 8000; // 8秒超时（生产环境边缘节点首字节可低于 1秒）

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

    const traceId = generateTraceId();
    const fileName = file.name;

    // 保存文件到本地
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const filePath = path.join(uploadDir, `${Date.now()}_${fileName}`);
    const arrayBuffer = await file.arrayBuffer();
    fs.writeFileSync(filePath, Buffer.from(arrayBuffer));

    // 预扫描总行数（Excel 用轻量元数据扫描；其他类型才做全量解析）
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
      try { fs.unlinkSync(filePath); } catch { /* ignore */ }
      return NextResponse.json(
        { success: false, error: `文件解析失败: ${err.message}，请检查文件格式或缩小文件大小` },
        { status: 400 }
      );
    }

    if (totalRows === 0) {
      try { fs.unlinkSync(filePath); } catch { /* ignore */ }
      return NextResponse.json({ success: false, error: "文件中没有可解析的数据行" }, { status: 400 });
    }

    // 扣除表头行（根据解析规则中的 headerRow / skipRows.top 计算实际数据行数）
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
        const skipTop = Number(cfg.skipRows?.top) || 0;
        // 数据行起始位置（1-based）= 表头行下一行；数据行数 = totalRows(含表头) - (headerRow) - skipBottom
        const skipBottom = Number(cfg.skipRows?.bottom) || 0;
        const dataRows = totalRows - headerRow - skipBottom;
        if (dataRows > 0) totalRows = dataRows;
        // 记录已知的 skipTop 语义：headerRow 已经包含 skipTop 的偏移，无需再减
      }
    } catch (e) {
      console.warn("[import-tasks] 扣除表头失败，使用原始行数:", e);
    }

    // 创建导入任务（含 Outbox 事务写入）
    try {
      const result = await Promise.race([
        createImportTask({
          fileName,
          filePath,
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
