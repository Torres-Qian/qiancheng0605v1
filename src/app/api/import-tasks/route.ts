// POST /api/import-tasks - 上传文件，创建异步导入任务
// 设计目标：P95 ≤ 1秒
// 优化策略：
//   1. 不上传时预扫描行数（省去 XLSX.read 的 200-500ms）
//   2. 事务内只写 import_tasks（~50ms），Outbox/batches 异步写入
//   3. 用文件大小快速估算行数，Worker 处理时修正实际值
import { NextRequest, NextResponse } from "next/server";
import { createImportTask } from "@/lib/services/import-task.service";

// 经验值：1000 行 Excel 约 0.45MB，即每行约 450 bytes
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

    // 快速估算行数（不解析文件内容，省去 XLSX.read 的数百毫秒）
    // Worker 处理时会在 processBatch 中修正为实际行数
    const estimatedRows = Math.max(1, Math.floor(fileSize / BYTES_PER_ROW_ESTIMATE));

    // base64 编码（必须同步完成以存入 DB）
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);
    const fileData = fileBuffer.toString("base64");

    // 创建任务（仅写 import_tasks 核心记录，Outbox/batches 异步写入不阻塞响应）
    const result = await createImportTask({
      fileName,
      filePath: `db://import_tasks/${fileName}`,
      fileData,
      parseRuleId,
      totalRows: estimatedRows,
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
