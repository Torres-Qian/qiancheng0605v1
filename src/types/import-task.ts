/** 导入任务相关类型定义 */

export interface ImportTaskCreateResult {
  taskId: string;
  traceId: string;
  status: string;
  totalRows: number;
  totalBatches: number;
}

export interface ImportTaskProgress {
  taskId: string;
  fileName: string;
  traceId: string;
  status: string;
  totalRows: number;
  processedRows: number;
  successRows: number;
  failedRows: number;
  totalBatches: number;
  completedBatches: number;
  degraded: boolean;
  degradedReason?: string;
  throughput?: number;
  estimatedRemaining?: number;
  createdAt: string;
  completedAt?: string;
}

export interface ImportTaskError {
  id: string;
  taskId: string;
  batchIndex: number;
  unitId?: string;
  rowNumber: number;
  fieldName?: string;
  rawValue?: string;
  errorCode: string;
  errorReason: string;
  traceId?: string;
  createdAt: string;
}

export interface BatchPerformance {
  id: string;
  taskId: string;
  unitId: string;
  batchIndex: number;
  parseDurationMs: number;
  ruleDurationMs: number;
  validateDurationMs: number;
  insertDurationMs: number;
  totalDurationMs: number;
  rowCount: number;
  status: string;
  traceId?: string;
  createdAt: string;
}

export interface BatchProcessResult {
  successCount: number;
  failedCount: number;
  parseDurationMs: number;
  ruleDurationMs: number;
  validateDurationMs: number;
  insertDurationMs: number;
  actualRowCount?: number; // 实际解析出的总行数（用于修正上传时的估算值）
}

export interface BatchProcessParams {
  taskId: string;
  unitId: string;
  batchIndex: number;
  startRow: number;
  endRow: number;
  filePath: string;
  parseRuleId: string;
  traceId: string;
}
