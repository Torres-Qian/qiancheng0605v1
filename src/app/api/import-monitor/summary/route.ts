// GET /api/import-monitor/summary - 监控聚合指标
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { importTasks, importTaskErrors, batchPerformanceLog, importTaskBatches } from "@/lib/db/schema";
import { eq, sql, and, gte, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const db = getDb();

    // 1. 实时吞吐量（过去 5 分钟每分钟成功入库行数）
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const throughputData = await db
      .select({
        minute: sql<string>`date_trunc('minute', ${importTasks.completedAt})::text`,
        rows: sql<number>`COALESCE(SUM(${importTasks.successRows}), 0)`,
      })
      .from(importTasks)
      .where(
        and(
          sql`${importTasks.completedAt} >= ${fiveMinutesAgo}`,
          sql`${importTasks.status} IN ('COMPLETED', 'PARTIAL_SUCCESS')`,
        ),
      )
      .groupBy(sql`date_trunc('minute', ${importTasks.completedAt})`)
      .orderBy(sql`date_trunc('minute', ${importTasks.completedAt})`);

    // 2. 队列积压深度
    const pendingBatches = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(importTaskBatches)
      .where(eq(importTaskBatches.status, "PENDING"));

    const pendingCount = pendingBatches[0]?.count || 0;
    const pendingRows = pendingCount * 1000;
    const queueThreshold = 5000;

    let queueStatus: "normal" | "warning" | "critical" = "normal";
    if (pendingRows > queueThreshold * 2) queueStatus = "critical";
    else if (pendingRows > queueThreshold) queueStatus = "warning";

    // 3. 阶段耗时分布（P50/P95/P99）
    const latencyStats = await db
      .select({
        parse_p50: sql<number>`PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${batchPerformanceLog.parseDurationMs})`,
        parse_p95: sql<number>`PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ${batchPerformanceLog.parseDurationMs})`,
        parse_p99: sql<number>`PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY ${batchPerformanceLog.parseDurationMs})`,
        validate_p50: sql<number>`PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${batchPerformanceLog.validateDurationMs})`,
        validate_p95: sql<number>`PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ${batchPerformanceLog.validateDurationMs})`,
        validate_p99: sql<number>`PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY ${batchPerformanceLog.validateDurationMs})`,
        insert_p50: sql<number>`PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${batchPerformanceLog.insertDurationMs})`,
        insert_p95: sql<number>`PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ${batchPerformanceLog.insertDurationMs})`,
        insert_p99: sql<number>`PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY ${batchPerformanceLog.insertDurationMs})`,
      })
      .from(batchPerformanceLog);

    const stats = latencyStats[0];
    const stageLatency = {
      parse: {
        p50: Math.round(stats?.parse_p50 || 0),
        p95: Math.round(stats?.parse_p95 || 0),
        p99: Math.round(stats?.parse_p99 || 0),
      },
      validate: {
        p50: Math.round(stats?.validate_p50 || 0),
        p95: Math.round(stats?.validate_p95 || 0),
        p99: Math.round(stats?.validate_p99 || 0),
      },
      insert: {
        p50: Math.round(stats?.insert_p50 || 0),
        p95: Math.round(stats?.insert_p95 || 0),
        p99: Math.round(stats?.insert_p99 || 0),
      },
    };

    // 4. 错误类型分布
    const errorDist = await db
      .select({
        errorCode: importTaskErrors.errorCode,
        count: sql<number>`COUNT(*)`,
      })
      .from(importTaskErrors)
      .groupBy(importTaskErrors.errorCode)
      .orderBy(desc(sql`COUNT(*)`));

    const totalErrors = errorDist.reduce((sum, e) => sum + e.count, 0);
    const errorDistribution = errorDist.map((e) => ({
      errorCode: e.errorCode,
      errorName: getErrorName(e.errorCode),
      count: e.count,
      percentage: totalErrors > 0 ? Math.round((e.count / totalErrors) * 10000) / 100 : 0,
    }));

    // 5. 慢批次 TOP 10
    const slowBatches = await db
      .select({
        taskId: batchPerformanceLog.taskId,
        unitId: batchPerformanceLog.unitId,
        batchIndex: batchPerformanceLog.batchIndex,
        totalDurationMs: batchPerformanceLog.totalDurationMs,
        parseDurationMs: batchPerformanceLog.parseDurationMs,
        validateDurationMs: batchPerformanceLog.validateDurationMs,
        insertDurationMs: batchPerformanceLog.insertDurationMs,
        rowCount: batchPerformanceLog.rowCount,
      })
      .from(batchPerformanceLog)
      .orderBy(desc(batchPerformanceLog.totalDurationMs))
      .limit(10);

    return NextResponse.json({
      success: true,
      data: {
        throughput: throughputData.map((t) => ({
          minute: t.minute?.substring(0, 16),
          rows: Number(t.rows),
        })),
        queueDepth: {
          pendingBatches: pendingCount,
          pendingRows,
          status: queueStatus,
          threshold: queueThreshold,
        },
        stageLatency,
        errorDistribution,
        slowBatches,
      },
    });
  } catch (err: any) {
    console.error("[monitor] 聚合查询失败:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

function getErrorName(code: string): string {
  const names: Record<string, string> = {
    E001: "SKU 不存在",
    E002: "必填字段缺失",
    E003: "电话格式错误",
    E004: "数量不是正数",
    E005: "外部编码重复",
    E006: "规则映射失败",
    E007: "数据库写入失败",
    E008: "文件格式不支持",
  };
  return names[code] || code;
}
