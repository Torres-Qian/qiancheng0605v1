/**
 * POST /api/blob — 文件直传 Vercel Blob Storage
 * 客户端先调用此端点获取 Blob URL，再调用 /api/import-tasks 创建任务
 * 实现"上传即返回 ≤1s"：文件不上传到 Serverless 函数
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

    // 直传到 Vercel Blob Storage（服务端 put()，可用于 private store）
    const blob = await put(file.name, file, {
      access: "public",
      addRandomSuffix: true, // 避免文件名冲突
      token: process.env.BLOB_READ_WRITE_TOKEN, // 显式传 token，兼容 private store
    });

    return NextResponse.json({
      success: true,
      data: {
        url: blob.url,
        downloadUrl: blob.downloadUrl,
        pathname: blob.pathname,
        contentType: blob.contentType,
        size: file.size,
      },
    });
  } catch (err: any) {
    console.error("[blob] Upload failed:", err.message);
    return NextResponse.json(
      { success: false, error: `文件上传失败: ${err.message}` },
      { status: 500 }
    );
  }
}
