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
import { importTasks, parseRules, eventOutbox, importTaskBatches } from "@/lib/db/schema";
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

    // Step 1: 立即创建任务并返回（~50ms，不解析文件内容）
    const result = await createImportTask({
      fileName,
      filePath: `db://import_tasks/${fileName}`,
      parseRuleId,
      totalRows: 1000, // 占位，Worker 处理时修正
    });

    // Step 2: 异步处理：预扫描 + 存文件（不阻塞响应）
    const { taskId } = result;
    const db = getDb();

    queueMicrotask(async () => {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const ext = fileName.split(".").pop()?.toLowerCase();

        // 预扫描行数 + 存文件（并行）
        const [rawRowCount, _blobResult] = await Promise.all([
          (async () => {
            if (ext !== "xlsx" && ext !== "xls") return 0;
            try { return countExcelRowsQuick(arrayBuffer); } catch { return 0; }
          })(),
          // 优先 Blob 上传，回退 base64 存 DB
          (async () => {
            try {
              const { put } = await import("@vercel/blob");
              const blob = await put(fileName, file, {
                access: "private", addRandomSuffix: true,
                token: process.env.BLOB_READ_WRITE_TOKEN,
              });
              await db.update(importTasks)
                .set({ filePath: blob.url } as any)
                .where(eq(importTasks.id, taskId));
            } catch {
              const fileData = Buffer.from(arrayBuffer).toString("base64");
              await db.update(importTasks)
                .set({ fileData } as any)
                .where(eq(importTasks.id, taskId));
            }
          })(),
        ]);

        // 修正 totalRows + 标记为 PROCESSING（让 Dispatcher 知道可以处理了）
        let totalRows = rawRowCount;
        if (totalRows > 0) {
          const ruleCfg = await (async () => {
            try {
              const rules = await db
                .select({ ruleConfig: parseRules.ruleConfig })
                .from(parseRules)
                .where(eq(parseRules.id, parseRuleId))
                .limit(1);
              return (rules[0]?.ruleConfig as any) || null;
            } catch { return null; }
          })();
          if (ruleCfg && totalRows > 0) {
            const headerRow = Number(ruleCfg.headerRow) || 1;
            const skipBottom = Number(ruleCfg.skipRows?.bottom) || 0;
            const dataRows = totalRows - headerRow - skipBottom;
            if (dataRows > 0) totalRows = dataRows;
          }
        }
        if (totalRows <= 0) totalRows = 1;

        // 修正 totalRows + 计算批次数 + 写 Outbox 事件
        const totalBatches = Math.ceil(totalRows / 1000);
        await db.transaction(async (tx) => {
          await tx.update(importTasks)
            .set({ totalRows, totalBatches } as any)
            .where(eq(importTasks.id, taskId));

          // 写 Outbox 事件（Dispatcher 会扫描到）
          const outboxEvents = [];
          for (let i = 0; i < totalBatches; i++) {
            outboxEvents.push({
              aggregateId: taskId,
              eventType: "ImportBatchCreated",
              payload: {
                event_id: `evt_${taskId}_${i}`,
                event_type: "ImportBatchCreated",
                schema_version: 1,
                aggregate_id: taskId,
                trace_id: result.traceId,
                occurred_at: new Date().toISOString(),
                payload: {
                  taskId,
                  unitId: `unit_${String(i).padStart(4, '0')}`,
                  batchIndex: i,
                  startRow: i * 1000,
                  endRow: Math.min((i + 1) * 1000 - 1, totalRows - 1),
                  filePath: '', // Worker 会从 import_tasks 表读取最新 filePath
                  parseRuleId,
                  traceId: result.traceId,
                },
              },
              status: "pending",
            });
          }
          if (outboxEvents.length > 0) {
            await tx.insert(eventOutbox).values(outboxEvents);
          }

          // 写 import_task_batches
          const batchRows = [];
          for (let i = 0; i < totalBatches; i++) {
            batchRows.push({
              taskId,
              unitId: `unit_${String(i).padStart(4, '0')}`,
              batchIndex: i,
              startRow: i * 1000,
              endRow: Math.min((i + 1) * 1000 - 1, totalRows - 1),
              status: "PENDING",
            });
          }
          if (batchRows.length > 0) {
            await tx.insert(importTaskBatches).values(batchRows);
          }
        });
      } catch (e) {
        console.error(`[import-tasks] 异步处理失败: ${taskId}`, e);
      }
    });

    return NextResponse.json({ success: true, data: result });
  } catch (err: any) {
    console.error("[import-tasks] 创建任务失败:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
