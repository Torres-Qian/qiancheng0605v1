'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DataTable } from '@/components/preview/DataTable';
import { ProgressBar } from '@/components/shared/ProgressBar';
import { EmptyState } from '@/components/shared/EmptyState';
import { showToast } from '@/components/shared/Toast';
import { useImportStore } from '@/stores/import-store';
import { validateAllRecords } from '@/lib/utils/validation';
import { exportToExcel } from '@/lib/utils/export';
import { ChevronRight, ArrowLeft, Send, Download, AlertCircle, CheckCircle } from 'lucide-react';

export default function PreviewPage() {
  const router = useRouter();
  const store = useImportStore();
  const [submitting, setSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState(0);

  // 实时校验
  useEffect(() => {
    if (store.records.length > 0) {
      const errors = validateAllRecords(store.records);
      store.setValidationErrors(errors);
    }
  }, [store.records]);

  const handleExport = () => {
    try {
      exportToExcel(store.records, store.fileName.replace(/\.[^.]+$/, ''));
      showToast('success', '导出成功');
    } catch {
      showToast('error', '导出失败');
    }
  };

  const handleSubmit = async () => {
    if (store.validationErrors.length > 0) {
      showToast('warning', '请先修正所有校验错误再提交');
      return;
    }

    setSubmitting(true);
    setSubmitProgress(0);

    try {
      const interval = setInterval(() => {
        setSubmitProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      const res = await fetch('/api/waybills/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          records: store.records,
          batchId: store.batchId,
          sourceFile: store.fileName,
          parseRuleId: store.selectedRule?.id,
        }),
      });

      clearInterval(interval);
      setSubmitProgress(100);

      const data = await res.json();
      if (data.success) {
        showToast('success', `提交成功！成功 ${data.data.success} 条，失败 ${data.data.failed} 条`);
        store.setStep('completed');
        setTimeout(() => router.push('/waybills'), 1500);
      } else {
        if (data.validationErrors) {
          store.setValidationErrors(data.validationErrors);
          showToast('error', '数据校验不通过，请修正后重试');
        } else {
          throw new Error(data.error);
        }
      }
    } catch (err: any) {
      showToast('error', `提交失败: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (store.step !== 'preview' && store.step !== 'submitting' && store.step !== 'completed') {
    return (
      <EmptyState
        title="没有可预览的数据"
        description="请先从导入页面上传文件并完成解析"
        action={
          <Link
            href="/import"
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-dark)] transition-colors"
          >
            前往导入
          </Link>
        }
      />
    );
  }

  const hasErrors = store.validationErrors.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/" className="text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)]">首页</Link>
        <ChevronRight className="w-4 h-4 text-[var(--color-text-placeholder)]" />
        <Link href="/import" className="text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)]">导入下单</Link>
        <ChevronRight className="w-4 h-4 text-[var(--color-text-placeholder)]" />
        <span className="text-[var(--color-text-primary)] font-medium">数据预览</span>
      </div>

      {/* 顶部操作栏 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">数据预览</h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
            {store.fileName} · {store.selectedRule?.name || '手动解析'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push('/import')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            返回
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors"
          >
            <Download className="w-4 h-4" />
            导出Excel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || hasErrors}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-dark)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
            {submitting ? '提交中...' : '提交下单'}
          </button>
        </div>
      </div>

      {/* 状态提醒 */}
      {hasErrors && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-[var(--color-warning-bg)] border border-[var(--color-warning-border)]">
          <AlertCircle className="w-5 h-5 text-[var(--color-warning)] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-[var(--color-warning)]">存在 {store.validationErrors.length} 个校验错误</p>
            <p className="text-xs text-[var(--color-text-secondary)] mt-1">请修正所有标红的字段后再提交下单</p>
          </div>
        </div>
      )}

      {!hasErrors && store.records.length > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-green-50 border border-green-200">
          <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-green-700">数据校验通过</p>
            <p className="text-xs text-green-600 mt-1">共 {store.records.length} 条记录，可以提交下单</p>
          </div>
        </div>
      )}

      {/* 提交进度 */}
      {submitting && (
        <div className="bg-white rounded-xl border border-[var(--color-border)] p-4">
          <ProgressBar percent={submitProgress} label="正在提交下单..." />
        </div>
      )}

      {/* 数据表格 */}
      {store.records.length > 0 && (
        <DataTable
          records={store.records}
          errors={store.validationErrors}
          onUpdateRecord={store.updateRecord}
          onDeleteRecord={store.deleteRecord}
          onAddRecord={store.addEmptyRecord}
        />
      )}
    </div>
  );
}
