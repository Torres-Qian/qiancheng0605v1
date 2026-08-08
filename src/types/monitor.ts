/** 监控指标相关类型定义 */

export interface MonitorSummary {
  throughput: ThroughputDataPoint[];
  queueDepth: QueueDepthInfo;
  stageLatency: StageLatencyData;
  errorDistribution: ErrorDistributionItem[];
  slowBatches: SlowBatchItem[];
}

export interface ThroughputDataPoint {
  minute: string;
  rows: number;
}

export interface QueueDepthInfo {
  pendingBatches: number;
  pendingRows: number;
  status: "normal" | "warning" | "critical";
  threshold: number;
}

export interface StageLatencyData {
  parse: LatencyStats;
  rule: LatencyStats;
  validate: LatencyStats;
  insert: LatencyStats;
}

export interface LatencyStats {
  p50: number;
  p95: number;
  p99: number;
}

export interface ErrorDistributionItem {
  errorCode: string;
  errorName: string;
  count: number;
  percentage: number;
}

export interface SlowBatchItem {
  taskId: string;
  unitId: string;
  batchIndex: number;
  totalDurationMs: number;
  parseDurationMs: number;
  ruleDurationMs: number;
  validateDurationMs: number;
  insertDurationMs: number;
  rowCount: number;
}
