/**
 * POST /api/blob/upload — 单分片上传（轻量代理）
 * 用 streaming 直传，避免 base64 编码开销
 * Vercel 函数处理流而不缓冲整个 body
 */
import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ success: false, error: "请上传文件" }, { status: 400 });
    }

    // 直接 put 到 Blob（服务端代理，不做 base64 编码）
    const blob = await put(file.name, file, {
      access: "private",
      addRandomSuffix: true,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    return NextResponse.json({
      success: true,
      data: { url: blob.url, pathname: blob.pathname, size: file.size },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// 关键配置：禁用 Vercel 函数的请求体缓冲（Vercel 默认会缓冲整个 multipart body）
export const runtime = "nodejs"; // 必须用 Node.js runtime 才能处理 multipart