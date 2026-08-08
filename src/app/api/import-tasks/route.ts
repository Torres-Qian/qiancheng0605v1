// POST /api/import-tasks - 上传文件，创建异步导入任务
// 设计目标：P95 ≤ 1秒
// 核心优化：先返回 taskId（不等待文件数据写入DB），文件内容通过 waitUntil 异步持久化
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

    // Step 1: 快速创建任务（不传 fileData，只写元数据，~50ms）
    const result = await createImportTask({
      fileName,
      filePath: `db://import_tasks/${fileName}`,
      // fileData 留空，先返回 taskId
      parseRuleId,
      totalRows: estimatedRows,
    });

    // Step 2: 先返回 taskId，文件数据异步持久化
    // 关键：arrayBuffer() 在响应返回后执行，不阻塞客户端等待
    const { taskId } = result;
    const db = getDb();

    // 使用 setImmediate 延迟到下一个事件循环（响应发送后）
    setImmediate(async () => {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const fileData = Buffer.from(arrayBuffer);
        await db.update(importTasks).set({ fileData } as any).where(eq(importTasks.id, taskId));
        console.log(`[import-tasks] 文件数据异步写入完成: ${taskId}`);
      } catch (e) {
        console.error(`[import-tasks] 文件数据异步写入失败: ${taskId}`, e);
      }
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
