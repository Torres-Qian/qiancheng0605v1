'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { DataTable } from '@/components/preview/DataTable';
import { FileDropZone } from '@/components/upload/FileDropZone';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { RuleConfig } from '@/types/rule';
import { WaybillRecord, ValidationError } from '@/types/waybill';
import { Upload, AlertCircle, CheckCircle, RefreshCw, FileWarning, FileText } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface PreviewPanelProps {
  file: File | null;
  ruleConfig: RuleConfig | null;
  onFileChange: (file: File | null) => void;
}

interface PreviewState {
  status: 'idle' | 'loading' | 'success' | 'error';
  records: WaybillRecord[];
  validationErrors: ValidationError[];
  warnings: string[];
  errors: string[];
  totalRows: number;
  truncated: boolean;
  message?: string;
  diagnostic?: {
    headers?: string[];
    headerRowIndex?: number;
    dataStartRow?: number;
    dataEndRow?: number;
    totalDataRows?: number;
    skippedCount?: number;
    sampleRecord?: Record<string, any>;
    sampleRows?: { rowIndex: number; isHeader: boolean; cells: string[] }[];
    configSnapshot?: Record<string, { source: string; value: string; matchPattern: string } | null>;
    fieldMatches?: Record<string, {
      label: string;
      mapped: boolean;
      configValue: string;
      matchedColumn?: string | null;
      colIndex?: number;
      reason?: string;
      source?: string;
      matchChain?: {
        exact: number;
        includes: number;
        regex: number;
        noSpaceExact: number;
        noSpaceIncludes: number;
      };
    }>;
  };
}

export function PreviewPanel({ file, ruleConfig, onFileChange }: PreviewPanelProps) {
  const [state, setState] = useState<PreviewState>({
    status: 'idle',
    records: [],
    validationErrors: [],
    warnings: [],
    errors: [],
    totalRows: 0,
    truncated: false,
  });
  const abortRef = useRef<AbortController | null>(null);

  const doParse = useCallback(async (f: File, config: RuleConfig) => {
    // 取消之前的请求
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setState(prev => ({ ...prev, status: 'loading' }));

    try {
      const formData = new FormData();
      formData.append('file', f);
      formData.append('ruleConfig', JSON.stringify(config));

      const res = await fetch('/api/preview', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `请求失败 (${res.status})`);
      }

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || '解析失败');
      }

      setState({
        status: 'success',
        records: data.data.records,
        validationErrors: data.data.validationErrors || [],
        warnings: data.data.parseWarnings || [],
        errors: data.data.parseErrors || [],
        totalRows: data.data.totalRows,
        truncated: data.data.truncated,
        diagnostic: data.data.diagnostic,
      });
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setState({
        status: 'error',
        records: [],
        validationErrors: [],
        warnings: [],
        errors: [],
        totalRows: 0,
        truncated: false,
        message: err.message || '解析失败，请检查规则配置',
      });
    }
  }, []);

  // 文件或规则变更时重新解析（500ms 防抖）
  useEffect(() => {
    if (!file || !ruleConfig) {
      setState(prev => ({
        ...prev,
        status: 'idle',
        records: [],
        validationErrors: [],
        warnings: [],
        errors: [],
        totalRows: 0,
        truncated: false,
        message: undefined,
      }));
      return;
    }

    const timer = setTimeout(() => {
      doParse(file, ruleConfig);
    }, 500);

    return () => clearTimeout(timer);
  }, [file, ruleConfig, doParse]);

  // 空状态 - 未上传文件
  if (!file) {
    return (
      <div className="bg-white rounded-xl border border-[var(--color-border)] overflow-hidden">
        <div className="p-6 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--color-primary-light)] flex items-center justify-center">
            <FileText className="w-8 h-8 text-[var(--color-primary)]" />
          </div>
          <h3 className="text-base font-semibold text-[var(--color-text-primary)] mb-2">预览解析效果</h3>
          <p className="text-sm text-[var(--color-text-tertiary)] mb-5 max-w-md mx-auto">
            上传一个样例文件，根据当前配置的规则实时预览解析结果
          </p>
          <div className="max-w-sm mx-auto">
            <FileDropZone
              onFileSelected={onFileChange}
              selectedFile={null}
              onClear={() => {}}
            />
          </div>
        </div>
      </div>
    );
  }

  // 有文件但无规则配置
  if (!ruleConfig) {
    return (
      <div className="bg-white rounded-xl border border-[var(--color-border)] overflow-hidden">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-[var(--color-text-primary)]">预览解析效果</h3>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 bg-[var(--color-surface-secondary)] rounded-lg">
            <FileText className="w-4 h-4 text-[var(--color-primary)]" />
            <span className="text-sm text-[var(--color-text-secondary)]">{file.name}</span>
            <button
              onClick={() => onFileChange(null)}
              className="ml-auto text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)]"
            >
              移除
            </button>
          </div>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-4">请先配置解析规则，配置完成后将自动预览</p>
        </div>
      </div>
    );
  }

  // 加载中
  if (state.status === 'loading') {
    return (
      <div className="bg-white rounded-xl border border-[var(--color-border)] overflow-hidden">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-[var(--color-text-primary)]">预览解析效果</h3>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 bg-[var(--color-surface-secondary)] rounded-lg mb-4">
            <FileText className="w-4 h-4 text-[var(--color-primary)]" />
            <span className="text-sm text-[var(--color-text-secondary)]">{file.name}</span>
            <button
              onClick={() => onFileChange(null)}
              className="ml-auto text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)]"
            >
              移除
            </button>
          </div>
          <LoadingSpinner text="正在解析文件..." />
        </div>
      </div>
    );
  }

  // 解析错误
  if (state.status === 'error') {
    return (
      <div className="bg-white rounded-xl border border-[var(--color-border)] overflow-hidden">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-[var(--color-text-primary)]">预览解析效果</h3>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 bg-[var(--color-surface-secondary)] rounded-lg mb-4">
            <FileText className="w-4 h-4 text-[var(--color-primary)]" />
            <span className="text-sm text-[var(--color-text-secondary)]">{file.name}</span>
            <button
              onClick={() => onFileChange(null)}
              className="ml-auto text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)]"
            >
              移除
            </button>
          </div>
          <div className="flex items-start gap-3 p-4 rounded-lg bg-red-50 border border-red-100">
            <AlertCircle className="w-5 h-5 text-[var(--color-danger)] flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-[var(--color-danger)] mb-1">解析失败</p>
              <p className="text-xs text-[var(--color-text-secondary)]">{state.message}</p>
              <button
                onClick={() => file && ruleConfig && doParse(file, ruleConfig)}
                className="mt-3 flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-white border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                重新解析
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 解析成功
  const totalIssues = state.validationErrors.length + state.warnings.length + state.errors.length;
  const hasNoRecords = state.status === 'success' && state.totalRows === 0;

  return (
    <div className="space-y-4">
      {/* 0条记录警告 */}
      {hasNoRecords && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-[var(--color-warning-bg)] border border-[var(--color-warning-border)]">
          <AlertCircle className="w-5 h-5 text-[var(--color-warning)] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-[var(--color-warning)]">未提取到数据</p>
            <p className="text-xs text-[var(--color-text-secondary)] mt-1">
              请检查"字段映射"中 SKU物品编码、SKU物品名称、SKU发货数量 对应的列名是否与文件表头一致
            </p>
          </div>
        </div>
      )}

      {/* 文件信息条 */}
      <div className="bg-white rounded-xl border border-[var(--color-border)] p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[var(--color-primary-light)] flex items-center justify-center">
              <FileText className="w-5 h-5 text-[var(--color-primary)]" />
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--color-text-primary)]">{file.name}</p>
              <p className={cn(
                  'text-xs',
                  hasNoRecords ? 'text-[var(--color-warning)] font-medium' : 'text-[var(--color-text-tertiary)]'
                )}>
                解析结果：{state.totalRows} 条记录
                {state.truncated && <span className="text-[var(--color-warning)] ml-1">（仅显示前 200 条）</span>}
                {hasNoRecords && <span className="ml-1">— 请检查字段映射配置</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {state.status === 'success' && state.validationErrors.length === 0 && (
              <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-green-50 text-green-600">
                <CheckCircle className="w-3 h-3" />
                校验通过
              </span>
            )}
            <button
              onClick={() => onFileChange(null)}
              className="text-xs px-2 py-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] transition-colors"
            >
              更换文件
            </button>
            <button
              onClick={() => file && ruleConfig && doParse(file, ruleConfig)}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary-light)] transition-colors"
              title="重新解析"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* 字段映射诊断 */}
      {state.diagnostic?.fieldMatches && (
        <div className="bg-white rounded-xl border border-[var(--color-border)] p-4">
          {state.diagnostic.configSnapshot && (
            <div className="mb-3 p-2 rounded bg-yellow-50 border border-yellow-100">
              <p className="text-[10px] text-yellow-700 font-medium mb-1">🔍 服务器收到配置:</p>
              <div className="grid grid-cols-3 gap-1 text-[10px]">
                {Object.entries(state.diagnostic.configSnapshot).map(([k, v]) => (
                  <span key={k} className="truncate">
                    <b>{k}:</b> {v ? `${v.source}="${v.value || v.matchPattern}"` : 'null'}
                  </span>
                ))}
              </div>
            </div>
          )}
          <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4 text-[var(--color-primary)]" />字段匹配诊断
          </h4>
          {state.diagnostic.headers && state.diagnostic.headers.length > 0 && (
            <div className="mb-3"><p className="text-xs text-[var(--color-text-tertiary)] mb-1">识别到的表头列（共 {state.diagnostic.headers.length} 列）:</p>
              <div className="flex flex-wrap gap-1">{state.diagnostic.headers.map((h, i) => (
                <span key={i} className="px-2 py-0.5 text-xs rounded bg-[var(--color-surface-secondary)] text-[var(--color-text-secondary)]">[{i}] {h || '(空)'}</span>
              ))}</div>
            </div>
          )}

          {/* 原始数据行样本（方便检查 PDF 聚类结果） */}
          {state.diagnostic.sampleRows && state.diagnostic.sampleRows.length > 0 && (
            <details className="mb-3">
              <summary className="text-xs text-[var(--color-text-tertiary)] cursor-pointer hover:text-[var(--color-primary)]">
                展开原始数据行样本（前 {state.diagnostic.sampleRows.length} 行）
              </summary>
              <div className="mt-2 overflow-x-auto">
                <table className="text-[10px] border-collapse">
                  <tbody>
                    {state.diagnostic.sampleRows.map((sr) => (
                      <tr key={sr.rowIndex} className={sr.isHeader ? 'bg-blue-50' : ''}>
                        <td className="px-1 py-0.5 text-[var(--color-text-placeholder)] border border-[var(--color-border-light)] whitespace-nowrap">
                          [{sr.rowIndex}]{sr.isHeader ? ' 表头' : ''}
                        </td>
                        {sr.cells.map((cell, ci) => (
                          <td key={ci} className={`px-1.5 py-0.5 border border-[var(--color-border-light)] max-w-[200px] truncate ${
                            sr.isHeader ? 'font-semibold text-[var(--color-text-primary)]' : 'text-[var(--color-text-secondary)]'
                          }`}>
                            {cell || <span className="text-[var(--color-text-placeholder)]">·</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}

          <div className="space-y-1.5">
            {Object.entries(state.diagnostic.fieldMatches).map(([key, info]) => {
              const sourceLabel: Record<string, string> = { column: '列映射', tailRegion: '尾部提取', regex: '正则', static: '静态值', cellContent: '整行' };
              // 列映射的匹配链详情
              const chain = info.matchChain;
              const chainDesc = chain
                ? (chain.exact >= 0
                  ? `精确匹配 → 列[${chain.exact}]`
                  : chain.includes >= 0
                    ? `包含匹配 → 列[${chain.includes}]`
                    : chain.regex >= 0
                      ? `正则匹配 → 列[${chain.regex}]`
                      : chain.noSpaceExact >= 0
                        ? `去空格精确匹配 → 列[${chain.noSpaceExact}]`
                        : chain.noSpaceIncludes >= 0
                          ? `去空格包含匹配 → 列[${chain.noSpaceIncludes}]`
                          : '未匹配')
                : '';
              return (
                <div key={key} className={cn('flex items-center gap-2 px-2 py-1.5 rounded text-xs', info.mapped ? 'bg-green-50' : 'bg-red-50')}>
                  <span className={cn('w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0', info.mapped ? 'bg-green-400' : 'bg-red-400')}>
                    {info.mapped ? <CheckCircle className="w-2.5 h-2.5 text-white" /> : <AlertCircle className="w-2.5 h-2.5 text-white" />}
                  </span>
                  <span className="w-24 flex-shrink-0 font-medium text-[var(--color-text-primary)]">{info.label}</span>
                  <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0',
                    info.source === 'column' ? 'bg-blue-100 text-blue-600' : info.source === 'tailRegion' ? 'bg-purple-100 text-purple-600' :
                    info.source === 'regex' ? 'bg-orange-100 text-orange-600' : info.source === 'static' ? 'bg-gray-100 text-gray-600' : 'bg-gray-100 text-gray-600'
                  )}>{sourceLabel[info.source || ''] || '未知'}</span>
                  {info.mapped ? (
                    info.source === 'column' ? (
                      <><span className="text-green-600">→ 列「{info.matchedColumn}」已匹配</span>
                        {chainDesc && <span className="text-[var(--color-text-placeholder)] ml-auto text-[9px]">{chainDesc}</span>}
                        <span className="text-[var(--color-text-placeholder)] ml-auto text-[9px]">列名: {info.configValue}</span></>
                    ) : <span className="text-green-600">已配置: {info.configValue}</span>
                  ) : (
                    info.source === 'column' ? (
                      <span className="text-red-600">
                        {info.configValue ? `列名「${info.configValue}」未在表头中找到` : info.reason || '未配置'}
                        {chain && <span className="block text-[9px] text-red-400 mt-0.5">匹配链: exact={chain.exact}→includes={chain.includes}→regex={chain.regex}→noSpaceExact={chain.noSpaceExact}→noSpaceIncludes={chain.noSpaceIncludes}</span>}
                      </span>
                    ) : <span className="text-red-600">{info.reason || '未配置'}</span>
                  )}
                </div>
              );
            })}
          </div>
          {state.diagnostic.skippedCount !== undefined && state.diagnostic.skippedCount > 0 && (
            <p className="text-xs text-[var(--color-text-tertiary)] mt-3">共扫描 {state.diagnostic.dataEndRow! - state.diagnostic.dataStartRow!} 行数据，其中 {state.diagnostic.skippedCount} 行因SKU字段为空被跳过</p>
          )}
          {state.diagnostic.sampleRecord && (
            <div className="mt-3 pt-3 border-t border-dashed border-[var(--color-border-light)]">
              <p className="text-xs text-[var(--color-text-tertiary)] mb-2">首条记录实际映射值:</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-1 text-[10px]">
                {Object.entries(state.diagnostic.sampleRecord).map(([k, v]) => (
                  <span key={k} className="px-1.5 py-0.5 rounded bg-[var(--color-surface-secondary)]">
                    <span className="text-[var(--color-text-placeholder)]">{k}: </span>
                    <span className={v ? 'text-[var(--color-text-primary)] font-medium' : 'text-red-400'}>{v || '(空)'}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 数据表格 */}
      <DataTable
        records={state.records}
        errors={state.validationErrors}
        onUpdateRecord={() => {}}
        onDeleteRecord={() => {}}
        onAddRecord={() => {}}
        readOnly
      />

      {/* 解析警告和错误汇总 */}
      {totalIssues > 0 && (
        <div className="bg-white rounded-xl border border-[var(--color-border)] p-4">
          <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3 flex items-center gap-2">
            <FileWarning className="w-4 h-4 text-[var(--color-warning)]" />
            解析详情
          </h4>
          <div className="space-y-2">
            {state.errors.map((err, i) => (
              <div key={`err-${i}`} className="flex items-start gap-2 text-xs">
                <AlertCircle className="w-3.5 h-3.5 text-[var(--color-danger)] flex-shrink-0 mt-0.5" />
                <span className="text-[var(--color-text-secondary)]">{err}</span>
              </div>
            ))}
            {state.warnings.map((warn, i) => (
              <div key={`warn-${i}`} className="flex items-start gap-2 text-xs">
                <AlertCircle className="w-3.5 h-3.5 text-[var(--color-warning)] flex-shrink-0 mt-0.5" />
                <span className="text-[var(--color-text-secondary)]">{warn}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
