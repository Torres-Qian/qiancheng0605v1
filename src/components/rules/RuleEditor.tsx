'use client';

import { useState, useEffect } from 'react';
import { RuleConfig, FieldMapping, FieldMappingItem, FileType, AiAnalysisResult } from '@/types/rule';
import { cn } from '@/lib/utils/cn';

interface RuleEditorProps {
  initialConfig?: RuleConfig;
  onConfigChange: (config: RuleConfig) => void;
  aiResult?: AiAnalysisResult | null;
  fileType?: FileType;
}

const defaultConfig: RuleConfig = {
  version: '1.0',
  skipRows: { top: 0, bottom: 0 },
  headerRow: 1,
  sheetMode: 'single',
  dataStartRow: 2,
  dataEndMode: 'auto',
  fieldMapping: {
    externalCode: { source: 'column', value: '' },
    recipientStore: { source: 'column', value: '' },
    recipientName: { source: 'column', value: '' },
    recipientPhone: { source: 'column', value: '' },
    recipientAddress: { source: 'column', value: '' },
    skuCode: { source: 'column', value: '' },
    skuName: { source: 'column', value: '' },
    skuQuantity: { source: 'column', value: '' },
    skuSpec: { source: 'column', value: '' },
    remark: { source: 'column', value: '' },
  },
  aggregation: { enabled: false, groupByField: 'externalCode', sharedFields: ['recipientStore', 'recipientName', 'recipientPhone', 'recipientAddress'] },
  matrixTransform: null,
  cardDetection: null,
  cellSplitConfig: null,
  multiOrderSplit: null,
  skipRowsPattern: '',
  defaultValues: {},
  postProcessors: [],
};

const fieldLabels: Record<string, string> = {
  externalCode: '外部编码',
  recipientStore: '收货门店',
  recipientName: '收件人姓名',
  recipientPhone: '收件人电话',
  recipientAddress: '收件人地址',
  skuCode: 'SKU物品编码',
  skuName: 'SKU物品名称',
  skuQuantity: 'SKU发货数量',
  skuSpec: 'SKU规格型号',
  remark: '备注',
};

export function RuleEditor({ initialConfig, onConfigChange, aiResult, fileType }: RuleEditorProps) {
  const [config, setConfig] = useState<RuleConfig>(initialConfig || defaultConfig);

  useEffect(() => {
    if (aiResult?.suggestedRule) {
      setConfig(aiResult.suggestedRule);
      onConfigChange(aiResult.suggestedRule);
    }
  }, [aiResult]);

  const updateConfig = (updates: Partial<RuleConfig>) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    onConfigChange(newConfig);
  };

  const updateFieldMapping = (field: keyof FieldMapping, updates: Partial<FieldMappingItem>) => {
    const newMapping = {
      ...config.fieldMapping,
      [field]: { ...config.fieldMapping[field], ...updates },
    };
    updateConfig({ fieldMapping: newMapping });
  };

  const getConfidenceClass = (field: string) => {
    if (!aiResult?.confidence) return '';
    const level = aiResult.confidence[field];
    if (level === 'high') return 'border-green-300 bg-green-50/30';
    if (level === 'medium') return 'border-yellow-300 bg-yellow-50/30';
    if (level === 'low') return 'border-red-200 bg-red-50/30';
    return '';
  };

  return (
    <div className="space-y-6">
      {/* 基础设置 */}
      <div className="bg-white rounded-xl border border-[var(--color-border)] p-5">
        <h3 className="text-base font-semibold text-[var(--color-text-primary)] mb-4">基础设置</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-[var(--color-text-tertiary)] mb-1">跳过顶部行</label>
            <input
              type="number"
              min="0"
              value={config.skipRows.top}
              onChange={e => updateConfig({ skipRows: { ...config.skipRows, top: parseInt(e.target.value) || 0 } })}
              className="w-full px-3 py-1.5 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:border-[var(--color-primary)]"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-text-tertiary)] mb-1">跳过底部行</label>
            <input
              type="number"
              min="0"
              value={config.skipRows.bottom}
              onChange={e => updateConfig({ skipRows: { ...config.skipRows, bottom: parseInt(e.target.value) || 0 } })}
              className="w-full px-3 py-1.5 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:border-[var(--color-primary)]"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-text-tertiary)] mb-1">表头行号</label>
            <input
              type="number"
              min="1"
              value={config.headerRow}
              onChange={e => updateConfig({ headerRow: parseInt(e.target.value) || 1 })}
              className="w-full px-3 py-1.5 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:border-[var(--color-primary)]"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-text-tertiary)] mb-1">数据起始行</label>
            <input
              type="number"
              min="1"
              value={config.dataStartRow}
              onChange={e => updateConfig({ dataStartRow: parseInt(e.target.value) || 1 })}
              className="w-full px-3 py-1.5 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:border-[var(--color-primary)]"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-text-tertiary)] mb-1">Sheet模式</label>
            <select
              value={config.sheetMode}
              onChange={e => updateConfig({ sheetMode: e.target.value as any })}
              className="w-full px-3 py-1.5 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:border-[var(--color-primary)]"
            >
              <option value="single">单Sheet</option>
              <option value="all">所有Sheet合并</option>
              <option value="multi">指定Sheet</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--color-text-tertiary)] mb-1">跳过行匹配模式</label>
            <input
              type="text"
              placeholder="如: 合计|总计"
              value={config.skipRowsPattern}
              onChange={e => updateConfig({ skipRowsPattern: e.target.value })}
              className="w-full px-3 py-1.5 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:border-[var(--color-primary)]"
            />
          </div>
        </div>
      </div>

      {/* 字段映射 */}
      <div className="bg-white rounded-xl border border-[var(--color-border)] p-5">
        <h3 className="text-base font-semibold text-[var(--color-text-primary)] mb-4">字段映射</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(Object.keys(fieldLabels) as (keyof FieldMapping)[]).map(field => (
            <div key={field} className={cn('flex items-center gap-2 p-2 rounded-lg border', getConfidenceClass(field))}>
              <span className="text-xs font-medium text-[var(--color-text-secondary)] w-24 flex-shrink-0">{fieldLabels[field]}</span>
              <select
                value={config.fieldMapping[field].source}
                onChange={e => updateFieldMapping(field, { source: e.target.value as any })}
                className="px-2 py-1 text-xs border border-[var(--color-border)] rounded focus:outline-none focus:border-[var(--color-primary)] flex-shrink-0"
              >
                <option value="column">列映射</option>
                <option value="tailRegion">尾部提取</option>
                <option value="regex">正则</option>
                <option value="static">静态值</option>
              </select>
              <input
                type="text"
                placeholder={config.fieldMapping[field].source === 'regex' || config.fieldMapping[field].source === 'tailRegion' ? '正则模式' : '列名/值'}
                value={config.fieldMapping[field].value || config.fieldMapping[field].matchPattern || ''}
                onChange={e => {
                  const key = config.fieldMapping[field].source === 'regex' || config.fieldMapping[field].source === 'tailRegion' ? 'matchPattern' : 'value';
                  updateFieldMapping(field, { [key]: e.target.value });
                }}
                className="flex-1 px-2 py-1 text-xs border border-[var(--color-border)] rounded focus:outline-none focus:border-[var(--color-primary)] min-w-0"
              />
              {aiResult?.confidence?.[field] && (
                <span className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0',
                  aiResult.confidence[field] === 'high' ? 'bg-green-100 text-green-600' :
                  aiResult.confidence[field] === 'medium' ? 'bg-yellow-100 text-yellow-600' :
                  'bg-red-100 text-red-600'
                )}>
                  {aiResult.confidence[field]}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 高级配置 */}
      <div className="bg-white rounded-xl border border-[var(--color-border)] p-5">
        <h3 className="text-base font-semibold text-[var(--color-text-primary)] mb-4">高级配置</h3>
        <div className="space-y-4">
          {/* 跨行聚合 */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.aggregation.enabled}
              onChange={e => updateConfig({ aggregation: { ...config.aggregation, enabled: e.target.checked } })}
              className="w-4 h-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
            />
            <div>
              <span className="text-sm font-medium text-[var(--color-text-primary)]">跨行聚合</span>
              <span className="text-xs text-[var(--color-text-tertiary)] ml-2">同一外部编码下的多个SKU行共享收货信息</span>
            </div>
          </label>

          {/* 矩阵转置 */}
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={!!config.matrixTransform?.enabled}
                onChange={e => updateConfig({
                  matrixTransform: e.target.checked
                    ? { enabled: true, transposeAxis: 'columns', labelField: 'recipientStore', valueField: '', startCol: 1 }
                    : null
                })}
                className="w-4 h-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
              />
              <div>
                <span className="text-sm font-medium text-[var(--color-text-primary)]">矩阵转置</span>
                <span className="text-xs text-[var(--color-text-tertiary)] ml-2">门店/日期作为列头横向展开，SKU×门店矩阵</span>
              </div>
            </label>
            {config.matrixTransform?.enabled && (
              <div className="ml-7 grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs text-[var(--color-text-tertiary)] mb-1">门店起始列(从0开始)</label>
                  <input
                    type="number"
                    min="0"
                    value={config.matrixTransform.startCol || 0}
                    onChange={e => updateConfig({
                      matrixTransform: { ...config.matrixTransform!, startCol: parseInt(e.target.value) || 0 }
                    })}
                    className="w-full px-2 py-1 text-xs border border-[var(--color-border)] rounded focus:outline-none focus:border-[var(--color-primary)]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--color-text-tertiary)] mb-1">门店结束列</label>
                  <input
                    type="number"
                    min="1"
                    value={config.matrixTransform.endCol || ''}
                    onChange={e => updateConfig({
                      matrixTransform: { ...config.matrixTransform!, endCol: parseInt(e.target.value) || undefined }
                    })}
                    placeholder="自动"
                    className="w-full px-2 py-1 text-xs border border-[var(--color-border)] rounded focus:outline-none focus:border-[var(--color-primary)]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--color-text-tertiary)] mb-1">转置映射字段</label>
                  <select
                    value={config.matrixTransform.labelField || 'recipientStore'}
                    onChange={e => updateConfig({
                      matrixTransform: { ...config.matrixTransform!, labelField: e.target.value }
                    })}
                    className="w-full px-2 py-1 text-xs border border-[var(--color-border)] rounded focus:outline-none focus:border-[var(--color-primary)]"
                  >
                    <option value="recipientStore">收货门店</option>
                    <option value="recipientName">收件人姓名</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* 卡片检测 */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={!!config.cardDetection?.enabled}
              onChange={e => updateConfig({
                cardDetection: e.target.checked
                  ? { enabled: true, startPattern: '', fieldsInsideCard: [] }
                  : null
              })}
              className="w-4 h-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
            />
            <div>
              <span className="text-sm font-medium text-[var(--color-text-primary)]">卡片式结构</span>
              <span className="text-xs text-[var(--color-text-tertiary)] ml-2">每条记录是独立的卡片区域</span>
            </div>
          </label>

          {/* 复合单元格拆分 */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={!!config.cellSplitConfig?.enabled}
              onChange={e => updateConfig({
                cellSplitConfig: e.target.checked
                  ? { enabled: true, targetField: 'skuName', separator: '\\n', itemPattern: '' }
                  : null
              })}
              className="w-4 h-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
            />
            <div>
              <span className="text-sm font-medium text-[var(--color-text-primary)]">复合单元格拆分</span>
              <span className="text-xs text-[var(--color-text-tertiary)] ml-2">单元格内含多行复合值，需拆分</span>
            </div>
          </label>

          {/* 多订单拆分 */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={!!config.multiOrderSplit?.enabled}
              onChange={e => updateConfig({
                multiOrderSplit: e.target.checked
                  ? { enabled: true, splitPattern: '' }
                  : null
              })}
              className="w-4 h-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
            />
            <div>
              <span className="text-sm font-medium text-[var(--color-text-primary)]">多订单拆分</span>
              <span className="text-xs text-[var(--color-text-tertiary)] ml-2">PDF中包含多个独立订单</span>
            </div>
          </label>
        </div>
      </div>
    </div>
  );
}
