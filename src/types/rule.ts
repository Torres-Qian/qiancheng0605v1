// 解析规则类型定义

export type FileType = 'excel' | 'word' | 'pdf';
export type FieldSource = 'column' | 'static' | 'tailRegion' | 'regex' | 'cellContent';
export type SheetMode = 'single' | 'multi' | 'all';
export type DataEndMode = 'auto' | 'fixed';

// 字段映射项
export interface FieldMappingItem {
  source: FieldSource;
  value?: string;           // 列名/静态值
  matchPattern?: string;    // 正则匹配模式（tailRegion/regex用）
  transform?: string | null; // 转换函数名
}

// 字段映射
export interface FieldMapping {
  externalCode: FieldMappingItem;
  recipientStore: FieldMappingItem;
  recipientName: FieldMappingItem;
  recipientPhone: FieldMappingItem;
  recipientAddress: FieldMappingItem;
  skuCode: FieldMappingItem;
  skuName: FieldMappingItem;
  skuQuantity: FieldMappingItem;
  skuSpec: FieldMappingItem;
  remark: FieldMappingItem;
}

// 聚合配置
export interface AggregationConfig {
  enabled: boolean;
  groupByField: string;     // 按哪个字段分组
  sharedFields: string[];   // 哪些字段是共享的
}

// 矩阵转置配置
export interface MatrixTransformConfig {
  enabled: boolean;
  transposeAxis: 'columns' | 'rows';
  labelField: string;       // 转置后的标签字段名
  valueField: string;       // 转置后的值字段名
  startCol?: number;        // 从第几列开始转置
  endCol?: number;          // 到第几列结束
}

// 卡片检测配置
export interface CardDetectionConfig {
  enabled: boolean;
  startPattern: string;     // 卡片起始标识（正则）
  endPattern?: string;      // 卡片结束标识
  fieldsInsideCard: {       // 卡片内部字段提取规则
    field: string;
    pattern: string;        // 正则匹配
  }[];
}

// 复合单元格拆分配置
export interface CellSplitConfig {
  enabled: boolean;
  targetField: string;      // 需要拆分的字段
  separator: string;        // 分隔符
  itemPattern: string;      // 每个item的匹配模式（正则，含命名组）
}

// 多订单拆分配置（PDF多单用）
export interface MultiOrderSplitConfig {
  enabled: boolean;
  splitPattern: string;     // 订单分隔标识（正则）
  orderNamePattern?: string; // 订单名提取正则
}

// 规则配置
export interface RuleConfig {
  version: string;
  skipRows: {
    top: number;
    bottom: number;
  };
  headerRow: number;        // 表头所在行（从1开始）
  sheetMode: SheetMode;
  sheetNames?: string[];
  dataStartRow: number;     // 数据起始行（全局）
  dataEndMode: DataEndMode;
  dataEndRow?: number;      // dataEndMode=fixed时指定
  dataColumnStartRow?: number; // 数据列映射起始行（覆盖 dataStartRow）
  dataColumnEndRow?: number;   // 数据列映射结束行（覆盖 dataEndRow，0表示自动）
  columnSkipBottomRows?: number; // 列映射阶段跳过底部 N 行（如跳过"备注"等尾部信息行）
  fieldMapping: FieldMapping;
  aggregation: AggregationConfig;
  matrixTransform: MatrixTransformConfig | null;
  cardDetection: CardDetectionConfig | null;
  cellSplitConfig: CellSplitConfig | null;
  multiOrderSplit: MultiOrderSplitConfig | null;
  skipRowsPattern: string;  // 跳过匹配的行（如"合计|总计"）
  columnSkipPattern?: string; // 列映射跳过匹配模式（匹配到的行不生成记录）
  defaultValues: Record<string, string>;
  postProcessors: string[];
}

// 解析规则
export interface ParseRule {
  id: string;
  name: string;
  description: string;
  fileType: FileType;
  ruleConfig: RuleConfig;
  createdBy: 'manual' | 'ai_assisted';
  createdAt: string;
  updatedAt: string;
}

// AI 分析结果
export interface AiAnalysisResult {
  analysis: string;
  suggestedRule: RuleConfig;
  confidence: Record<string, 'high' | 'medium' | 'low'>;
}

// 文件原始数据
export interface RawDataGrid {
  headers: string[];
  rows: string[][];
  rawText: string;
  metadata: FileMetadata;
  sheets?: Record<string, RawDataGrid>;  // 多Sheet
}

export interface FileMetadata {
  fileName: string;
  fileType: FileType;
  sheetCount: number;
  totalRows: number;
  totalCols: number;
}
