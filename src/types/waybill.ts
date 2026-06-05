// 运单数据模型
export interface WaybillRecord {
  id?: string;
  externalCode: string;
  // A组：门店模式
  recipientStore: string;
  // B组：收件人模式
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  // SKU信息
  skuCode: string;
  skuName: string;
  skuQuantity: number;
  skuSpec: string;
  // 附加
  remark: string;
  // 元数据
  batchId?: string;
  sourceFile?: string;
  parseRuleId?: string;
  status?: 'imported' | 'submitted';
  // 前端特有
  rowIndex?: number;
  errors?: ValidationError[];
}

export interface ValidationError {
  rowIndex: number;
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

// 导入批次
export interface ImportBatch {
  id: string;
  fileName: string;
  ruleId: string;
  ruleName: string;
  recordCount: number;
  status: 'parsing' | 'preview' | 'submitting' | 'completed';
  createdAt: string;
}

// 提交结果
export interface SubmitResult {
  success: number;
  failed: number;
  errors?: { row: number; message: string }[];
}
