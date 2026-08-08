// POST /api/import-tasks - 上传文件，创建异步导入任务
// 设计目标：P95 ≤ 1秒
// 优化策略：
//   1. 不预扫描行数，创建 1 个批次（≤ BATCH_SIZE 行），Worker 处理时按实际行数修正
//   2. 事务内只写 import_tasks 元数据，Outbox 异步写入
//   3. fileData 用 base64 存入 text 字段
//   注意：单批次上限 1000 行（与 BATCH_SIZE 一致）；超大文件需要在客户端分批上传
import { NextRequest, NextResponse } from "next/server";
import { createImportTask } from "@/lib/services/import-task.service";
import { getDb } from "@/lib/db";
import { importTasks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const BATCH_SIZE = 1000;

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

    // Step 1: 创建任务（单批次设计，totalRows=BATCH_SIZE 表示最多处理 1000 行）
    // Worker 处理后用实际行数修正 totalRows
    const result = await createImportTask({
      fileName,
      filePath: `db://import_tasks/${fileName}`,
      parseRuleId,
      totalRows: BATCH_SIZE,
    });

    // Step 2: 同步读取并 base64 编码文件数据
    const arrayBuffer = await file.arrayBuffer();
    const fileData = Buffer.from(arrayBuffer).toString("base64");

    // UPDATE 写入文件数据
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
