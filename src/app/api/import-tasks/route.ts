// POST /api/import-tasks - 上传文件，创建异步导入任务
// 设计目标：P95 ≤ 1秒
// 优化策略：
//   1. 不预扫描行数（用文件大小估算，Worker 修正）
//   2. 事务内只写 import_tasks 元数据，Outbox 异步写入
//   3. fileData 同步写入（必须等，否则 Worker 取不到文件）
import { NextRequest, NextResponse } from "next/server";
import { createImportTask } from "@/lib/services/import-task.service";
import { getDb } from "@/lib/db";
import { importTasks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const BYTES_PER_ROW_ESTIMATE = 500;

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
    const fileSize = file.size;
    const estimatedRows = Math.max(1, Math.floor(fileSize / BYTES_PER_ROW_ESTIMATE));

    // Step 1: 创建任务（事务内只写 import_tasks 元数据，Outbox 异步）
    const result = await createImportTask({
      fileName,
      filePath: `db://import_tasks/${fileName}`,
      parseRuleId,
      totalRows: estimatedRows,
    });

    // Step 2: 同步读取并写入文件数据
    // Vercel 的 request.formData() 已把文件读入内存，arrayBuffer() 是零拷贝返回引用
    const arrayBuffer = await file.arrayBuffer();
    const fileData = Buffer.from(arrayBuffer);

    // 直接 UPDATE（不复用 createImportTask 中的事务）
    const db = getDb();
    await db.update(importTasks).set({ fileData } as any).where(eq(importTasks.id, result.taskId));

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    console.error("[import-tasks] 创建任务失败:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
