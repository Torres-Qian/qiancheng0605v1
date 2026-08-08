// GET /api/import-tasks/[taskId]/batches - 查询批次性能
import { NextRequest, NextResponse } from "next/server";
import { getBatchPerformance } from "@/lib/services/import-task.service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  try {
    const { taskId } = await params;

    if (!taskId) {
      return NextResponse.json({ success: false, error: "缺少 taskId" }, { status: 400 });
    }

    const batches = await getBatchPerformance(taskId);

    return NextResponse.json({ success: true, data: batches });
  } catch (err: any) {
    console.error("[import-tasks] 查询批次性能失败:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
