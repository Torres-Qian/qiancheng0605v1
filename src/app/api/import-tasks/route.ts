// POST /api/import-tasks - 创建异步导入任务
// 设计目标：P95 ≤ 1秒
//
// 支持两种模式：
//   A. Blob 模式（推荐）：前端先调用 /api/blob 上传文件到 Vercel Blob，再传入 blobUrl
//      性能：P50 < 100ms（API 只处理 JSON，不解析 multipart）
//   B. Legacy 模式（兼容）：前端直接传 file 到 FormData
//      性能：取决于文件大小，小文件 < 500ms，大文件受 Vercel multipart 解析限制
//
// 实现：
//   1. 预扫描行数 + 规则查询并行（仅 xlsx）
//   2. 事务内只写 import_tasks，Outbox 异步写入
//   3. 文件数据存入 DB（base64 编码的 text 字段）
import { NextRequest, NextResponse } from "next/server";
import { createImportTask } from "@/lib/services/import-task.service";
import { countExcelRowsQuick } from "@/lib/engine/readers/excel";
import { getDb } from "@/lib/db";
import { importTasks, parseRules } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";

    // ====== Blob 模式：JSON body ======
    if (contentType.includes("application/json")) {
      const body = await request.json();
      const { blobUrl, fileName, parseRuleId } = body;

      if (!blobUrl || !fileName) {
        return NextResponse.json({ success: false, error: "缺少 blobUrl 或 fileName" }, { status: 400 });
      }
      if (!parseRuleId) {
        return NextResponse.json({ success: false, error: "请选择解析规则" }, { status: 400 });
      }

      // Blob 模式：
      //   - filePath 存 Blob URL，Worker 通过 BLOB_READ_WRITE_TOKEN 下载
      //   - API 不下载文件，只写元数据
      //   - P50 < 100ms
      const BATCH_SIZE = 1000;

      const result = await createImportTask({
        fileName,
        filePath: blobUrl,
        parseRuleId,
        totalRows: BATCH_SIZE,
      });

      return NextResponse.json({ success: true, data: result });
    }

    // ====== Legacy 模式：multipart/form-data ======
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

    // 并行：预扫描行数 + 规则查询 + Blob 上传
    const [rawRowCount, ruleCfg, blobResult] = await Promise.all([
      (async () => {
        if (ext !== "xlsx" && ext !== "xls") return 0;
        try { return countExcelRowsQuick(arrayBuffer); } catch { return 0; }
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
        } catch { return null; }
      })(),
      // 异步上传到 Vercel Blob Storage（并行，不阻塞主流程）
      (async () => {
        try {
          // 动态导入 @vercel/blob 避免冷启动加载
          const { put } = await import("@vercel/blob");
          const blob = await put(fileName, file, {
            access: "private",
            addRandomSuffix: true,
            token: process.env.BLOB_READ_WRITE_TOKEN,
          });
          return { url: blob.url };
        } catch { return null; }
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
    if (totalRows <= 0) totalRows = 1;

    // 文件存储策略：优先用 Blob URL（更快），否则 base64 存 DB
    const filePath = blobResult?.url
      ? blobResult.url  // Blob URL，Worker 直接下载
      : `db://import_tasks/${fileName}`;  // 回退到 DB 存储

    // 创建任务
    const result = await createImportTask({
      fileName,
      filePath,
      parseRuleId,
      totalRows,
    });

    // 如果没有 Blob URL，存 base64 到 DB
    if (!blobResult?.url) {
      const fileData = Buffer.from(arrayBuffer).toString("base64");
      const db = getDb();
      await db.update(importTasks).set({ fileData }).where(eq(importTasks.id, result.taskId));
    }

    return NextResponse.json({ success: true, data: result });
  } catch (err: any) {
    console.error("[import-tasks] 创建任务失败:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
