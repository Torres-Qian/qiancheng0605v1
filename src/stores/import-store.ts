'use client';

import { create } from 'zustand';
import { WaybillRecord, ValidationError } from '@/types/waybill';
import { ParseRule } from '@/types/rule';

interface ImportStore {
  step: 'upload' | 'select_rule' | 'parsing' | 'preview' | 'submitting' | 'completed';
  file: File | null;
  fileName: string;
  selectedRule: ParseRule | null;
  records: WaybillRecord[];
  validationErrors: ValidationError[];
  progress: { current: number; total: number; percent: number };
  batchId: string | null;
  error: string | null;

  setStep: (step: ImportStore['step']) => void;
  setFile: (file: File | null) => void;
  setSelectedRule: (rule: ParseRule | null) => void;
  setRecords: (records: WaybillRecord[]) => void;
  updateRecord: (index: number, updates: Partial<WaybillRecord>) => void;
  deleteRecord: (index: number) => void;
  addEmptyRecord: () => void;
  setValidationErrors: (errors: ValidationError[]) => void;
  setProgress: (progress: ImportStore['progress']) => void;
  setBatchId: (batchId: string | null) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const initialState = {
  step: 'upload' as const,
  file: null,
  fileName: '',
  selectedRule: null,
  records: [],
  validationErrors: [],
  progress: { current: 0, total: 0, percent: 0 },
  batchId: null,
  error: null,
};

export const useImportStore = create<ImportStore>((set) => ({
  ...initialState,

  setStep: (step) => set({ step }),
  setFile: (file) => set({ file, fileName: file?.name || '' }),
  setSelectedRule: (rule) => set({ selectedRule: rule }),
  setRecords: (records) => set({ records }),
  updateRecord: (index, updates) =>
    set((state) => ({
      records: state.records.map((r, i) => (i === index ? { ...r, ...updates } : r)),
    })),
  deleteRecord: (index) =>
    set((state) => ({
      records: state.records.filter((_, i) => i !== index),
    })),
  addEmptyRecord: () =>
    set((state) => ({
      records: [
        ...state.records,
        {
          externalCode: '',
          recipientStore: '',
          recipientName: '',
          recipientPhone: '',
          recipientAddress: '',
          skuCode: '',
          skuName: '',
          skuQuantity: 0,
          skuSpec: '',
          remark: '',
          rowIndex: state.records.length,
        },
      ],
    })),
  setValidationErrors: (errors) => set({ validationErrors: errors }),
  setProgress: (progress) => set({ progress }),
  setBatchId: (batchId) => set({ batchId }),
  setError: (error) => set({ error }),
  reset: () => set(initialState),
}));
