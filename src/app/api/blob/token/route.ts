/**
 * POST /api/blob/token — 返回客户端上传授权
 * 响应 < 50ms（仅返回 token 和 pathname，不处理文件）
 */
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const fileName = body.fileName || `upload-${Date.now()}.xlsx`;
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      return NextResponse.json({ success: false, error: "BLOB_READ_WRITE_TOKEN 未配置" }, { status: 500 });
    }
    // 生成唯一 pathname，避免冲突
    const pathname = `imports/${Date.now()}-${fileName}`;
    return NextResponse.json({
      success: true,
      data: { token, pathname },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}