// 导入流程类型
import { ParseRule } from './rule';
import { WaybillRecord, ValidationError } from './waybill';

export type ImportStep = 'upload' | 'select_rule' | 'parsing' | 'preview' | 'submitting' | 'completed';

export interface ImportState {
  step: ImportStep;
  file: File | null;
  fileName: string;
  selectedRule: ParseRule | null;
  records: WaybillRecord[];
  validationErrors: ValidationError[];
  progress: {
    current: number;
    total: number;
    percent: number;
  };
  batchId: string | null;
  error: string | null;
}
