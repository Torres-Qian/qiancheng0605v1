/**
 * POST /api/blob/token — 返回客户端上传授权
 * 响应 < 50ms（仅返回 token，不处理文件）
 */
import { NextRequest, NextResponse } from "next/server";

export async function POST(_request: NextRequest): Promise<NextResponse> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return NextResponse.json({ success: false, error: "BLOB_READ_WRITE_TOKEN 未配置" }, { status: 500 });
  }
  return NextResponse.json({ success: true, data: { token } });
}
