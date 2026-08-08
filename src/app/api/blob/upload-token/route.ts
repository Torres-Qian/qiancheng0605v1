/**
 * POST /api/blob/upload-token — 客户端上传授权
 * 返回 token 和 pathname，前端用 @vercel/blob 客户端 SDK 直接 PUT 到 Blob Storage
 * 响应时间 < 100ms（仅生成 token，不处理文件）
 */
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { fileName } = await request.json();
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      return NextResponse.json({ success: false, error: "BLOB_READ_WRITE_TOKEN 未配置" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        token,
        pathname: `imports/${fileName}`,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}