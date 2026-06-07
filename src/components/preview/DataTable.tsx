'use client';

import { useRef, useCallback, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { WaybillRecord, ValidationError } from '@/types/waybill';
import { cn } from '@/lib/utils/cn';
import { Trash2, Plus, AlertCircle } from 'lucide-react';

interface DataTableProps {
  records: WaybillRecord[];
  errors: ValidationError[];
  onUpdateRecord: (index: number, updates: Partial<WaybillRecord>) => void;
  onDeleteRecord: (index: number) => void;
  onAddRecord: () => void;
  readOnly?: boolean;
}

const columns = [
  { key: 'rowIndex', label: '#', width: 50, editable: false },
  { key: 'externalCode', label: '外部编码', width: 180, editable: true },
  { key: 'recipientStore', label: '收货门店', width: 200, editable: true },
  { key: 'recipientName', label: '收件人姓名', width: 130, editable: true },
  { key: 'recipientPhone', label: '收件人电话', width: 140, editable: true },
  { key: 'recipientAddress', label: '收件人地址', width: 280, editable: true },
  { key: 'skuCode', label: 'SKU编码', width: 150, editable: true, required: true },
  { key: 'skuName', label: 'SKU名称', width: 180, editable: true, required: true },
  { key: 'skuQuantity', label: '数量', width: 90, editable: true, required: true, type: 'number' },
  { key: 'skuSpec', label: '规格', width: 140, editable: true },
  { key: 'remark', label: '备注', width: 180, editable: true },
  { key: 'actions', label: '操作', width: 60, editable: false },
];

export function DataTable({ records, errors, onUpdateRecord, onDeleteRecord, onAddRecord, readOnly = false }: DataTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const readOnlyColumns = useMemo(() => columns.filter(c => c.key !== 'actions'), []);

  const virtualizer = useVirtualizer({
    count: records.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 42,
    overscan: 10,
  });

  // 构建错误索引
  const errorMap = useMemo(() => {
    const map = new Map<number, ValidationError[]>();
    errors.forEach(e => {
      if (!map.has(e.rowIndex)) map.set(e.rowIndex, []);
      map.get(e.rowIndex)!.push(e);
    });
    return map;
  }, [errors]);

  const getFieldError = (rowIndex: number, field: string): ValidationError | undefined => {
    const rowErrors = errorMap.get(rowIndex);
    return rowErrors?.find(e => e.field === field);
  };

  const totalWidth = (readOnly ? readOnlyColumns : columns).reduce((sum, c) => sum + c.width, 0);

  return (
    <div className="bg-white rounded-xl border border-[var(--color-border)] overflow-hidden">
      {/* 工具栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-3">
          <span className="text-sm text-[var(--color-text-secondary)]">
            共 <span className="font-medium text-[var(--color-text-primary)]">{records.length}</span> 条记录
          </span>
          {errors.length > 0 && (
            <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-[var(--color-danger-bg)] text-[var(--color-danger)]">
              <AlertCircle className="w-3 h-3" />
              {errors.length} 个错误
            </span>
          )}
        </div>
        {!readOnly && (
          <button
            onClick={onAddRecord}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-[var(--color-primary-light)] text-[var(--color-primary-darker)] hover:bg-[var(--color-info-border)] transition-colors font-medium"
          >
            <Plus className="w-3.5 h-3.5" />
            新增行
          </button>
        )}
      </div>

      {/* 表格 */}
      <div ref={parentRef} className="overflow-auto max-h-[600px]" style={{ overflowAnchor: 'none' }}>
        {/* 表头 */}
        <div
          className="sticky top-0 z-10 flex bg-[var(--color-surface-secondary)] border-b border-[var(--color-border)]"
          style={{ minWidth: totalWidth }}
        >
          {(readOnly ? readOnlyColumns : columns).map(col => (
            <div
              key={col.key}
              className="px-3 py-2.5 text-xs font-medium text-[var(--color-text-tertiary)] flex-shrink-0"
              style={{ width: col.width }}
            >
              {col.label}
              {col.required && <span className="text-[var(--color-danger)] ml-0.5">*</span>}
            </div>
          ))}
        </div>

        {/* 虚拟列表数据行 */}
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative', minWidth: totalWidth }}>
          {virtualizer.getVirtualItems().map(virtualRow => {
            const record = records[virtualRow.index];
            if (!record) return null;

            const rowErrors = errorMap.get(record.rowIndex ?? virtualRow.index);
            const hasError = !!rowErrors && rowErrors.length > 0;

            return (
              <div
                key={virtualRow.index}
                className={cn(
                  'absolute flex w-full border-b border-[var(--color-border-light)] transition-colors',
                  hasError ? 'bg-red-50/50' : 'hover:bg-[var(--color-surface-hover)]'
                )}
                style={{ height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}
              >
                {(readOnly ? readOnlyColumns : columns).map(col => {
                  if (col.key === 'rowIndex') {
                    return (
                      <div key={col.key} className="px-3 py-2 text-xs text-[var(--color-text-tertiary)] flex items-center flex-shrink-0" style={{ width: col.width }}>
                        {virtualRow.index + 1}
                      </div>
                    );
                  }
                  if (col.key === 'actions') {
                    return (
                      <div key={col.key} className="px-2 py-1.5 flex items-center flex-shrink-0" style={{ width: col.width }}>
                        <button
                          onClick={() => onDeleteRecord(virtualRow.index)}
                          className="p-1 rounded hover:bg-red-50 text-[var(--color-text-placeholder)] hover:text-[var(--color-danger)] transition-colors"
                          title="删除行"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  }
                  if (!col.editable) return null;

                  const fieldError = getFieldError(record.rowIndex ?? virtualRow.index, col.key);
                  const value = (record as any)[col.key];

                  // readOnly 模式：只显示文本，不显示输入框
                  if (readOnly) {
                    return (
                      <div key={col.key} className={cn(
                        'px-3 py-2 text-xs flex items-center flex-shrink-0 truncate',
                        fieldError ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-primary)]'
                      )} style={{ width: col.width }} title={String(value ?? '')}>
                        {value ?? '-'}
                      </div>
                    );
                  }

                  return (
                    <div key={col.key} className="px-3 py-1.5 flex items-center flex-shrink-0 relative" style={{ width: col.width }}>
                      <input
                        type={col.type === 'number' ? 'number' : 'text'}
                        value={value ?? ''}
                        onChange={e => {
                          const newVal = col.type === 'number' ? (parseInt(e.target.value, 10) || 0) : e.target.value;
                          onUpdateRecord(virtualRow.index, { [col.key]: newVal });
                        }}
                        className={cn(
                          'w-full px-2 py-1 text-xs border rounded focus:outline-none focus:border-[var(--color-primary)] transition-colors',
                          fieldError ? 'border-[var(--color-danger)] bg-red-50' : 'border-transparent hover:border-[var(--color-border)] focus:bg-white'
                        )}
                      />
                      {fieldError && (
                        <div className="absolute -bottom-1 left-3 right-3">
                          <span className="text-[10px] text-[var(--color-danger)] truncate block">{fieldError.message}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* 错误汇总 */}
      {errors.length > 0 && (
        <div className="border-t border-[var(--color-border)] p-4">
          <h4 className="text-sm font-medium text-[var(--color-danger)] mb-2 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            数据校验错误 ({errors.length})
          </h4>
          <div className="space-y-1 max-h-[200px] overflow-auto">
            {errors.map((err, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
                <span className="text-[var(--color-danger)] font-medium">第{err.rowIndex + 1}行</span>
                <span className="text-[var(--color-text-placeholder)]">|</span>
                <span>{err.field}</span>
                <span className="text-[var(--color-text-placeholder)]">|</span>
                <span>{err.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
