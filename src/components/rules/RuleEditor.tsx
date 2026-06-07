'use client';

import { useState, useEffect, useRef } from 'react';
import { RuleConfig, FieldMapping, FieldMappingItem, FileType, AiAnalysisResult } from '@/types/rule';
import { cn } from '@/lib/utils/cn';
import { AlertCircle } from 'lucide-react';

// 可编辑数字输入框：本地编辑状态，失焦后提交；支持悬停提示
function EditableNumberInput({ label, value, onChange, tip, placeholder }: {
  label: string; value: number; onChange: (v: number) => void; tip?: string; placeholder?: string;
}) {
  const [edit, setEdit] = useState(String(value));
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { setEdit(String(value)); }, [value]);

  const commit = () => {
    const n = parseInt(edit, 10);
    if (!isNaN(n)) onChange(n);
    else setEdit(String(value));
  };

  return (
    <div className="group relative">
      <label className="flex items-center gap-1 text-xs text-[var(--color-text-tertiary)] mb-1">
        {label}
        {tip && (
          <span className="relative cursor-help">
            <span className="inline-flex items-center justify-center w-3.5 h-3.5 text-[10px] leading-none rounded-full border border-[var(--color-text-tertiary)] text-[var(--color-text-tertiary)] opacity-60 group-hover:opacity-100 transition-opacity">?</span>
            <span className="pointer-events-none absolute top-full left-0 mt-1.5 px-4 py-2.5 text-sm leading-relaxed text-white bg-[var(--color-primary)] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-lg w-max max-w-[360px] whitespace-normal text-left">
              {tip}
            </span>
          </span>
        )}
      </label>
      <input ref={ref} type="text" inputMode="numeric" value={edit}
        placeholder={placeholder}
        onChange={e => { if (/^\d*$/.test(e.target.value)) setEdit(e.target.value); }}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') { commit(); ref.current?.blur(); } }}
        className="w-full px-3 py-1.5 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:border-[var(--color-primary)]" />
    </div>
  );
}

// 带悬停提示的 Label 组件（用于非 EditableNumberInput 的输入项）
function LabelWithTip({ text, tip }: { text: string; tip?: string }) {
  return (
    <label className="flex items-center gap-1 text-xs text-[var(--color-text-tertiary)] mb-1 group relative">
      {text}
      {tip && (
        <span className="relative cursor-help">
          <span className="inline-flex items-center justify-center w-3.5 h-3.5 text-[10px] leading-none rounded-full border border-[var(--color-text-tertiary)] text-[var(--color-text-tertiary)] opacity-60 group-hover:opacity-100 transition-opacity">?</span>
          <span className="pointer-events-none absolute top-full left-0 mt-1.5 px-4 py-2.5 text-sm leading-relaxed text-white bg-[var(--color-primary)] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-lg w-max max-w-[360px] whitespace-normal text-left">
            {tip}
          </span>
        </span>
      )}
    </label>
  );
}

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

// 尾部提取的默认关键词（切换时自动填充）
const tailRegionDefaults: Record<string, string> = {
  externalCode: '单据号',
  recipientStore: '收货机构',
  recipientName: '收货人',
  recipientPhone: '收货电话',
  recipientAddress: '收货地址',
  skuCode: '',
  skuName: '',
  skuQuantity: '',
  skuSpec: '',
  remark: '备注',
};

// 字段映射行子组件
function FieldMappingRow({
  field, config, fieldLabels, tailRegionDefaults,
  getConfidenceClass, aiResult, updateFieldMapping
}: {
  field: keyof FieldMapping;
  config: RuleConfig;
  fieldLabels: Record<string, string>;
  tailRegionDefaults: Record<string, string>;
  getConfidenceClass: (field: string) => string;
  aiResult?: AiAnalysisResult | null;
  updateFieldMapping: (field: keyof FieldMapping, updates: Partial<FieldMappingItem>) => void;
}) {
  // 安全获取字段映射（缺失时回退到默认值）
  const fm = config.fieldMapping[field] || { source: 'column', value: '' } as FieldMappingItem;
  return (
    <div key={field} className={cn('flex items-center gap-2 p-2 rounded-lg border', getConfidenceClass(field))}>
      <span className="text-xs font-medium text-[var(--color-text-secondary)] w-24 flex-shrink-0">{fieldLabels[field]}</span>
      <select
        value={fm.source || 'column'}
        onChange={e => {
          const newSource = e.target.value as any;
          if (newSource === 'tailRegion') {
            const defaultKeyword = tailRegionDefaults[field] || '';
            updateFieldMapping(field, { source: newSource, matchPattern: defaultKeyword });
          } else {
            updateFieldMapping(field, { source: newSource });
          }
        }}
        className="px-2 py-1 text-xs border border-[var(--color-border)] rounded focus:outline-none focus:border-[var(--color-primary)] flex-shrink-0"
      >
        <option value="column">列映射</option>
        <option value="tailRegion">尾部提取</option>
        <option value="regex">正则</option>
        <option value="static">静态值</option>
      </select>
      {fm.source === 'tailRegion' ? (
        <div className="flex-1 min-w-0 flex items-center gap-1">
          <span className="text-[10px] text-[var(--color-text-placeholder)] flex-shrink-0">关键词:</span>
          <input
            type="text"
            placeholder="如: 收货人"
            value={fm.matchPattern || ''}
            onChange={e => updateFieldMapping(field, { matchPattern: e.target.value })}
            className="flex-1 px-2 py-1 text-xs border border-[var(--color-border)] rounded focus:outline-none focus:border-[var(--color-primary)] min-w-0"
          />
        </div>
      ) : (
        <input
          type="text"
          placeholder={fm.source === 'regex' ? '正则模式' : '列名/静态值'}
          value={fm.value || fm.matchPattern || ''}
          onChange={e => {
            const key = fm.source === 'regex' ? 'matchPattern' : 'value';
            updateFieldMapping(field, { [key]: e.target.value });
          }}
          className="flex-1 px-2 py-1 text-xs border border-[var(--color-border)] rounded focus:outline-none focus:border-[var(--color-primary)] min-w-0"
        />
      )}
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
  );
}

export function RuleEditor({ initialConfig, onConfigChange, aiResult, fileType }: RuleEditorProps) {
  // 安全保障：确保 fieldMapping 始终包含所有字段，防止 undefined
  const safeConfig = (raw: RuleConfig | null | undefined): RuleConfig => {
    if (!raw) return defaultConfig;
    const merged = { ...defaultConfig, ...raw };
    // 逐字段合并 fieldMapping，防止部分缺失
    for (const f of Object.keys(defaultConfig.fieldMapping) as (keyof FieldMapping)[]) {
      merged.fieldMapping[f] = { ...defaultConfig.fieldMapping[f], ...(raw.fieldMapping?.[f] || {}) } as any;
    }
    return merged;
  };

  const [config, setConfig] = useState<RuleConfig>(safeConfig(initialConfig));

  useEffect(() => {
    if (aiResult?.suggestedRule) {
      const safe = safeConfig(aiResult.suggestedRule);
      setConfig(safe);
      onConfigChange(safe);
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
      {/* 数据列设置 — 基础参数 + SKU列映射 */}
      <div className="bg-white rounded-xl border border-[var(--color-border)] p-5">
        <h3 className="text-base font-semibold text-[var(--color-text-primary)] mb-1">数据列设置</h3>
        <p className="text-xs text-[var(--color-text-tertiary)] mb-4">定义数据行范围和SKU字段的列映射关系，每一行生成一条导入记录。</p>

        {/* 基础参数 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <EditableNumberInput label="跳过顶部行" value={config.skipRows.top}
            onChange={v => updateConfig({ skipRows: { ...config.skipRows, top: v } })}
            tip="从文件顶部跳过的行数，用于排除标题、表头等非数据行" />
          <EditableNumberInput label="跳过底部行" value={config.skipRows.bottom}
            onChange={v => updateConfig({ skipRows: { ...config.skipRows, bottom: v } })}
            tip="从文件底部跳过的行数，用于排除汇总、签章等非数据行" />
          <EditableNumberInput label="表头行号" value={config.headerRow}
            onChange={v => updateConfig({ headerRow: v })}
            tip="列名所在的物理行号，引擎从此行提取字段名进行列匹配" />
          <div>
            <LabelWithTip text="Sheet模式" tip="单Sheet只解析第一个工作表；所有Sheet合并会将多个表的数据合并；指定Sheet则手动选择" />
            <select value={config.sheetMode} onChange={e => updateConfig({ sheetMode: e.target.value as any })}
              className="w-full px-3 py-1.5 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:border-[var(--color-primary)]">
              <option value="single">单Sheet</option>
              <option value="all">所有Sheet合并</option>
              <option value="multi">指定Sheet</option>
            </select>
          </div>
          <div>
            <LabelWithTip text="跳过行匹配模式" tip="正则表达式，匹配到的整行将被跳过（不参与列映射）。例：合计|总计|小计" />
            <input type="text" placeholder="如: 合计|总计" value={config.skipRowsPattern}
              onChange={e => updateConfig({ skipRowsPattern: e.target.value })}
              className="w-full px-3 py-1.5 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:border-[var(--color-primary)]" />
          </div>
          <div>
            <LabelWithTip text="列映射跳过模式" tip="正则表达式，匹配到的数据行不生成记录。与上方跳过不同，此规则在表头解析之后、字段映射阶段生效" />
            <input type="text" placeholder="如: 备注|说明" value={config.columnSkipPattern || ''}
              onChange={e => updateConfig({ columnSkipPattern: e.target.value || undefined })}
              className="w-full px-3 py-1.5 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:border-[var(--color-primary)]" />
          </div>
          <EditableNumberInput label="列映射跳过底部行" value={config.columnSkipBottomRows ?? 0}
            onChange={v => updateConfig({ columnSkipBottomRows: v > 0 ? v : undefined })}
            tip="跳过数据区域末尾的N行不参与列映射，如制单人、打印次数等尾部信息行"
            placeholder="跳过尾部N行" />
          <EditableNumberInput label="列映射开始行号" value={config.dataColumnStartRow ?? 0}
            onChange={v => updateConfig({ dataColumnStartRow: v > 0 ? v : undefined })}
            tip="列映射的起始行号（从1开始），设为0则自动从表头下一行开始"
            placeholder="0=自动" />
        </div>

        {/* 分隔 + 全部字段映射 */}
        <div className="pt-4 border-t border-[var(--color-border)]">
          <p className="text-xs text-[var(--color-text-tertiary)] mb-3">字段映射 — 配置每个字段的数据来源:</p>

          {/* 检测到所有字段都是静态值时显示警告 */}
          {Object.values(config.fieldMapping).filter(f => !!f).every(f => (f as FieldMappingItem).source === 'static') && (
            <div className="flex items-center justify-between gap-3 p-3 mb-3 rounded-lg bg-amber-50 border border-amber-200">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <div>
                  <p className="text-xs font-medium text-amber-700">当前所有字段都设置为"静态值"模式，不会从文件中读取数据</p>
                  <p className="text-[10px] text-amber-600 mt-0.5">请改为"列映射"并填写对应的列名，才能正确解析</p>
                </div>
              </div>
              <button
                onClick={() => {
                  const newMapping = { ...config.fieldMapping };
                  const fields = Object.keys(fieldLabels) as (keyof FieldMapping)[];
                  for (const f of fields) {
                    newMapping[f] = { source: 'column', value: newMapping[f].value || '' };
                  }
                  updateConfig({ fieldMapping: newMapping });
                }}
                className="flex-shrink-0 px-3 py-1.5 text-xs font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
              >
                一键切换到列映射
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(Object.keys(fieldLabels) as (keyof FieldMapping)[]).map(field => (
              <FieldMappingRow key={field} {...{ field, config, fieldLabels, tailRegionDefaults, getConfidenceClass, aiResult, updateFieldMapping }} />
            ))}
          </div>
        </div>

        {/* 默认值（当提取不到时的回退值） */}
        <div className="mt-4 pt-4 border-t border-dashed border-[var(--color-border-light)]">
          <p className="text-xs text-[var(--color-text-tertiary)] mb-3">字段提取失败时的默认回退值（可选）:</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {(Object.keys(fieldLabels) as (keyof FieldMapping)[]).map(field => (
              <div key={field} className="flex items-center gap-1.5">
                <span className="text-[10px] text-[var(--color-text-placeholder)] flex-shrink-0 w-20 truncate">{fieldLabels[field]}</span>
                <input
                  type="text"
                  placeholder="回退值"
                  value={config.defaultValues?.[field] || ''}
                  onChange={e => {
                    const newDefaults = { ...(config.defaultValues || {}) };
                    if (e.target.value) { newDefaults[field] = e.target.value; }
                    else { delete newDefaults[field]; }
                    updateConfig({ defaultValues: newDefaults });
                  }}
                  className="flex-1 px-2 py-1 text-xs border border-[var(--color-border)] rounded focus:outline-none focus:border-[var(--color-primary)] min-w-0"
                />
              </div>
            ))}
          </div>
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
          <div className="space-y-3">
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
            {config.cardDetection?.enabled && (
              <div className="ml-7 space-y-2">
                <div>
                  <label className="block text-xs text-[var(--color-text-tertiary)] mb-1">卡片起始匹配（正则）</label>
                  <input type="text" value={config.cardDetection.startPattern || ''}
                    placeholder="如: 调拨记录\s*#\d+"
                    onChange={e => updateConfig({ cardDetection: { ...config.cardDetection!, startPattern: e.target.value } })}
                    className="w-full px-2 py-1.5 text-xs border border-[var(--color-border)] rounded focus:outline-none focus:border-[var(--color-primary)]" />
                </div>
                <div>
                  <label className="block text-xs text-[var(--color-text-tertiary)] mb-1">卡片结束匹配（可选正则）</label>
                  <input type="text" value={config.cardDetection.endPattern || ''}
                    placeholder="可选"
                    onChange={e => updateConfig({ cardDetection: { ...config.cardDetection!, endPattern: e.target.value || undefined } })}
                    className="w-full px-2 py-1.5 text-xs border border-[var(--color-border)] rounded focus:outline-none focus:border-[var(--color-primary)]" />
                </div>
              </div>
            )}
          </div>

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
