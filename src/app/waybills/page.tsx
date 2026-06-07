'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { showToast } from '@/components/shared/Toast';
import { WaybillRecord } from '@/types/waybill';
import {
  ChevronRight, Search, ListOrdered, ChevronLeft, ChevronRight as ChevronRightIcon,
  Filter, X, RotateCcw, Download
} from 'lucide-react';

export default function WaybillsPage() {
  const [records, setRecords] = useState<WaybillRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  // 筛选
  const [filterCode, setFilterCode] = useState('');
  const [filterName, setFilterName] = useState('');
  const [filterStore, setFilterStore] = useState('');
  const [filterSkuCode, setFilterSkuCode] = useState('');
  const [filterSkuName, setFilterSkuName] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  // 防抖搜索
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // 全局搜索防抖
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput), 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // 重置时同步清空
  useEffect(() => {
    if (debouncedSearch) {
      setFilterCode(debouncedSearch);
      setFilterSkuCode(debouncedSearch);
    }
  }, [debouncedSearch]);

  const hasActiveFilters = filterCode || filterName || filterStore || filterSkuName || filterDate || filterDateTo;

  const resetFilters = () => {
    setFilterCode('');
    setFilterName('');
    setFilterStore('');
    setFilterSkuCode('');
    setFilterSkuName('');
    setFilterDate('');
    setFilterDateTo('');
    setSearchInput('');
    setDebouncedSearch('');
    setPage(1);
  };

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('pageSize', pageSize.toString());
      if (filterCode) params.set('externalCode', filterCode);
      if (filterName) params.set('recipientName', filterName);
      if (filterStore) params.set('recipientStore', filterStore);
      if (filterSkuCode) params.set('skuCode', filterSkuCode);
      if (filterSkuName) params.set('skuName', filterSkuName);
      if (filterDate) params.set('dateFrom', filterDate);
      if (filterDateTo) params.set('dateTo', filterDateTo);

      const res = await fetch(`/api/waybills?${params}`);
      const data = await res.json();
      if (data.success) {
        setRecords(data.data);
        setTotal(data.pagination.total);
      }
    } catch {
      showToast('error', '加载运单列表失败');
    } finally {
      setLoading(false);
    }
  }, [page, filterCode, filterName, filterStore, filterSkuCode, filterSkuName, filterDate, filterDateTo]);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  const totalPages = Math.ceil(total / pageSize);

  // 导出当前筛选结果
  const handleExport = () => {
    if (records.length === 0) return;
    try {
      const { exportToExcel } = require('@/lib/utils/export');
      exportToExcel(records, `运单导出_${new Date().toISOString().slice(0, 10)}`);
      showToast('success', '导出成功');
    } catch {
      showToast('error', '导出失败');
    }
  };

  return (
    <div className="space-y-6" style={{ width: '100%' }}>
      <div className="flex items-center gap-2 text-sm">
        <Link href="/" className="text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)]">首页</Link>
        <ChevronRight className="w-4 h-4 text-[var(--color-text-placeholder)]" />
        <span className="text-[var(--color-text-primary)] font-medium">运单列表</span>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">已导入运单</h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
            共 {total} 条记录
            {hasActiveFilters && <span className="text-[var(--color-primary)] ml-2">（已筛选）</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={records.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors disabled:opacity-40"
          >
            <Download className="w-4 h-4" />
            导出
          </button>
        </div>
      </div>

      {/* 筛选栏 */}
      <div className="bg-white rounded-xl border border-[var(--color-border)] p-4 space-y-3">
        {/* 主搜索行 */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-placeholder)]" />
            <input
              type="text"
              placeholder="全局搜索：编码 / SKU编码..."
              value={searchInput}
              onChange={e => { setSearchInput(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-3 py-2 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:border-[var(--color-primary)]"
            />
          </div>
          <button
            onClick={() => setShowMoreFilters(!showMoreFilters)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors ${
              showMoreFilters || hasActiveFilters
                ? 'border-[var(--color-primary)] text-[var(--color-primary)] bg-[var(--color-primary-light)]'
                : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
            }`}
          >
            <Filter className="w-4 h-4" />
            高级筛选
            {hasActiveFilters && (
              <span className="w-5 h-5 rounded-full bg-[var(--color-primary)] text-white text-xs flex items-center justify-center">
                {[filterName, filterStore, filterSkuName, filterDate, filterDateTo].filter(Boolean).length}
              </span>
            )}
          </button>
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              重置
            </button>
          )}
        </div>

        {/* 高级筛选展开区 */}
        {showMoreFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-[var(--color-border-light)]">
            <div>
              <label className="block text-xs text-[var(--color-text-tertiary)] mb-1">收货门店</label>
              <input
                type="text"
                placeholder="门店名称..."
                value={filterStore}
                onChange={e => { setFilterStore(e.target.value); setPage(1); }}
                className="w-full px-3 py-1.5 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:border-[var(--color-primary)]"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-tertiary)] mb-1">收件人姓名</label>
              <input
                type="text"
                placeholder="收件人姓名..."
                value={filterName}
                onChange={e => { setFilterName(e.target.value); setPage(1); }}
                className="w-full px-3 py-1.5 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:border-[var(--color-primary)]"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-tertiary)] mb-1">SKU名称</label>
              <input
                type="text"
                placeholder="物品名称..."
                value={filterSkuName}
                onChange={e => { setFilterSkuName(e.target.value); setPage(1); }}
                className="w-full px-3 py-1.5 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:border-[var(--color-primary)]"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-tertiary)] mb-1">外部编码</label>
              <input
                type="text"
                placeholder="配送单号..."
                value={filterCode}
                onChange={e => { setFilterCode(e.target.value); setPage(1); }}
                className="w-full px-3 py-1.5 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:border-[var(--color-primary)]"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-tertiary)] mb-1">提交时间 从</label>
              <input
                type="date"
                value={filterDate}
                onChange={e => { setFilterDate(e.target.value); setPage(1); }}
                className="w-full px-3 py-1.5 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:border-[var(--color-primary)]"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-tertiary)] mb-1">提交时间 到</label>
              <input
                type="date"
                value={filterDateTo}
                onChange={e => { setFilterDateTo(e.target.value); setPage(1); }}
                className="w-full px-3 py-1.5 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:border-[var(--color-primary)]"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={resetFilters}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] transition-colors"
              >
                <X className="w-4 h-4" />
                清除所有筛选
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 数据表格 */}
      {loading ? (
        <LoadingSpinner text="加载运单列表..." />
      ) : records.length === 0 ? (
        <EmptyState
          icon={<ListOrdered className="w-8 h-8 text-[var(--color-text-placeholder)]" />}
          title={hasActiveFilters ? '没有匹配的运单记录' : '暂无运单记录'}
          description={hasActiveFilters ? '尝试调整筛选条件' : '导入下单成功后，运单数据将在此展示'}
          action={
            hasActiveFilters ? (
              <button
                onClick={resetFilters}
                className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-dark)] transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                清除筛选
              </button>
            ) : (
              <Link
                href="/import"
                className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-dark)] transition-colors"
              >
                前往导入
              </Link>
            )
          }
        />
      ) : (
        <>
          <div className="bg-white rounded-xl border border-[var(--color-border)] overflow-hidden">
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[var(--color-surface-secondary)] border-b border-[var(--color-border)]">
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-[var(--color-text-tertiary)]">外部编码</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-[var(--color-text-tertiary)]">收货门店</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-[var(--color-text-tertiary)]">收件人</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-[var(--color-text-tertiary)]">电话</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-[var(--color-text-tertiary)]">SKU编码</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-[var(--color-text-tertiary)]">SKU名称</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-[var(--color-text-tertiary)]">数量</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-[var(--color-text-tertiary)]">提交时间</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => (
                    <tr key={record.id} className="border-b border-[var(--color-border-light)] hover:bg-[var(--color-surface-hover)] transition-colors">
                      <td className="px-4 py-2.5 text-xs text-[var(--color-text-secondary)] font-mono">
                        {record.externalCode ? (
                          <span className="bg-[var(--color-surface-hover)] px-1.5 py-0.5 rounded text-[var(--color-primary-darker)]">
                            {record.externalCode}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[var(--color-text-secondary)]">{record.recipientStore || '-'}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--color-text-secondary)]">{record.recipientName || '-'}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--color-text-secondary)] font-mono">{record.recipientPhone || '-'}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--color-text-secondary)] font-mono">{record.skuCode}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--color-text-secondary)]">{record.skuName}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--color-text-secondary)] text-right font-mono">
                        <span className="inline-flex items-center justify-center min-w-[28px] px-1.5 py-0.5 rounded bg-[var(--color-primary-light)] text-[var(--color-primary-darker)] font-medium">
                          {record.skuQuantity}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[var(--color-text-tertiary)] whitespace-nowrap">
                        {(record as any).createdAt ? new Date((record as any).createdAt).toLocaleString('zh-CN') : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 分页 */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--color-text-tertiary)]">
              第 {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} 条，共 {total} 条
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(1)}
                  disabled={page === 1}
                  className="px-2 py-1.5 text-xs rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] disabled:opacity-30 transition-colors"
                >
                  首页
                </button>
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 7) {
                    pageNum = i + 1;
                  } else if (page <= 4) {
                    pageNum = i + 1;
                  } else if (page >= totalPages - 3) {
                    pageNum = totalPages - 6 + i;
                  } else {
                    pageNum = page - 3 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={`w-8 h-8 text-xs rounded-lg transition-colors ${
                        pageNum === page
                          ? 'bg-[var(--color-primary)] text-white font-medium'
                          : 'border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] disabled:opacity-30 transition-colors"
                >
                  <ChevronRightIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage(totalPages)}
                  disabled={page === totalPages}
                  className="px-2 py-1.5 text-xs rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] disabled:opacity-30 transition-colors"
                >
                  末页
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
