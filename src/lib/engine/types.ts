// 规则引擎内部类型
import { RawDataGrid, RuleConfig } from '@/types/rule';
import { WaybillRecord } from '@/types/waybill';

export interface ParseContext {
  rawData: RawDataGrid;
  ruleConfig: RuleConfig;
  results: WaybillRecord[];
  errors: string[];
  warnings: string[];
}

export interface ReaderResult {
  data: RawDataGrid;
  error?: string;
}

export interface PreprocessResult {
  data: RawDataGrid;
  skippedRows: number[];
}
