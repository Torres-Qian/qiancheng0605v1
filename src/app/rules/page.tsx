'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { showToast } from '@/components/shared/Toast';
import { useConfirm } from '@/components/shared/ConfirmDialog';
import { ParseRule } from '@/types/rule';
import { Plus, Search, FileText, Copy, Trash2, Edit3, ChevronRight, Sparkles, Settings } from 'lucide-react';

export default function RulesPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const [rules, setRules] = useState<ParseRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const loadRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/rules');
      const data = await res.json();
      if (data.success) setRules(data.data);
    } catch {
      showToast('error', '加载规则失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRules(); }, [loadRules]);

  const handleDelete = async (rule: ParseRule) => {
    confirm({
      title: '删除规则',
      message: `确定要删除规则「${rule.name}」吗？此操作不可撤销。`,
      variant: 'danger',
      confirmText: '删除',
      async onConfirm() {
        try {
          const res = await fetch(`/api/rules/${rule.id}`, { method: 'DELETE' });
          const data = await res.json();
          if (data.success) {
            showToast('success', '规则已删除');
            loadRules();
          }
        } catch {
          showToast('error', '删除失败');
        }
      },
    });
  };

  const handleCopy = async (rule: ParseRule) => {
    try {
      const res = await fetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${rule.name} (副本)`,
          description: rule.description,
          fileType: rule.fileType,
          ruleConfig: rule.ruleConfig,
          createdBy: 'manual',
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', '规则已复制');
        loadRules();
      }
    } catch {
      showToast('error', '复制失败');
    }
  };

  const filteredRules = rules.filter(r =>
    !search || r.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6" style={{ width: '100%' }}>
      <div className="flex items-center gap-2 text-sm">
        <Link href="/" className="text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)]">首页</Link>
        <ChevronRight className="w-4 h-4 text-[var(--color-text-placeholder)]" />
        <span className="text-[var(--color-text-primary)] font-medium">解析规则</span>
      </div>

      {/* 顶部操作栏 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">解析规则</h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">管理文件解析规则，支持AI辅助生成</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-placeholder)]" />
            <input
              type="text"
              placeholder="搜索规则..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:border-[var(--color-primary)] w-48"
            />
          </div>
          <Link
            href="/rules/new"
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-dark)] transition-colors font-medium"
          >
            <Plus className="w-4 h-4" />
            新建规则
          </Link>
        </div>
      </div>

      {/* 规则列表 */}
      {loading ? (
        <LoadingSpinner text="加载规则列表..." />
      ) : filteredRules.length === 0 ? (
        <EmptyState
          icon={<Settings className="w-8 h-8 text-[var(--color-text-placeholder)]" />}
          title={search ? '没有匹配的规则' : '暂无解析规则'}
          description={search ? '尝试其他搜索关键词' : '创建第一条解析规则，支持AI辅助生成'}
          action={
            !search && (
              <Link
                href="/rules/new"
                className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-dark)] transition-colors"
              >
                <Plus className="w-4 h-4" />
                新建规则
              </Link>
            )
          }
        />
      ) : (
        <div className="space-y-2">
          {filteredRules.map(rule => (
            <div
              key={rule.id}
              className="bg-white rounded-xl border border-[var(--color-border)] hover:border-[var(--color-primary)] transition-all duration-200 group"
            >
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-[var(--color-surface-hover)] flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-[var(--color-text-secondary)]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{rule.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-surface-hover)] text-[var(--color-text-tertiary)]">
                        {rule.fileType}
                      </span>
                      {rule.createdBy === 'ai_assisted' && (
                        <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-600">
                          <Sparkles className="w-3 h-3" /> AI辅助
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => router.push(`/rules/${rule.id}`)}
                    className="p-2 rounded-lg hover:bg-[var(--color-surface-hover)] text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)] transition-colors"
                    title="编辑"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleCopy(rule)}
                    className="p-2 rounded-lg hover:bg-[var(--color-surface-hover)] text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)] transition-colors"
                    title="复制"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(rule)}
                    className="p-2 rounded-lg hover:bg-[var(--color-danger-bg)] text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] transition-colors"
                    title="删除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
