// GET /api/import-tasks/[taskId]/errors - 查询错误明细（分页+筛选）
import { NextRequest, NextResponse } from "next/server";
import { getTaskErrors } from "@/lib/services/import-task.service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  try {
    const { taskId } = await params;

    if (!taskId) {
      return NextResponse.json({ success: false, error: "缺少 taskId" }, { status: 400 });
    }

    const url = new URL(request.url);
    const batchIndex = url.searchParams.get("batch");
    const errorCode = url.searchParams.get("error_code");
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const pageSize = parseInt(url.searchParams.get("page_size") || "50", 10);

    const result = await getTaskErrors(taskId, {
      batchIndex: batchIndex ? parseInt(batchIndex, 10) : undefined,
      errorCode: errorCode || undefined,
      page,
      pageSize,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (err: any) {
    console.error("[import-tasks] 查询错误明细失败:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
