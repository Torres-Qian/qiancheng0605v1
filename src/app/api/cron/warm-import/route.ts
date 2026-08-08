// GET /api/cron/warm-import - Vercel Cron 定时预热端点
// 每 3 分钟调用一次，保持 import-tasks 路由的函数实例处于热状态
// 配合动态 import 优化，降低冷启动概率
//
// Vercel Hobby 限制：
//   - 最多 1 个 cron job（已满足）
//   - 最长执行 10s
//   - 只能使用 GET 方法

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function GET() {
  const start = Date.now();

  try {
    // 预热：触发动态 import 链（drizzle + neon + schema），让实例热起来
    const { getDb } = await import("@/lib/db");
    const db = getDb();
    // 执行一个轻量查询确认连接正常
    await db.execute("SELECT 1");

    const latency = Date.now() - start;
    return NextResponse.json({
      status: "ok",
      message: "import-tasks route warmed up",
      latencyMs: latency,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[warm-import] 预热失败:", err.message);
    return NextResponse.json(
      { status: "error", error: err.message, latencyMs: Date.now() - start },
      { status: 500 },
    );
  }
}
