// GET /api/import-tasks/[taskId] - 查询任务进度
import { NextRequest, NextResponse } from "next/server";
import { getTaskProgress } from "@/lib/services/import-task.service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  try {
    const { taskId } = await params;

    if (!taskId) {
      return NextResponse.json({ success: false, error: "缺少 taskId" }, { status: 400 });
    }

    const progress = await getTaskProgress(taskId);

    if (!progress) {
      return NextResponse.json({ success: false, error: "任务不存在" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: progress });
  } catch (err: any) {
    console.error("[import-tasks] 查询进度失败:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
