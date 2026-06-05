'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { RuleEditor } from '@/components/rules/RuleEditor';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { showToast } from '@/components/shared/Toast';
import { ParseRule, RuleConfig } from '@/types/rule';
import { ChevronRight, ArrowLeft, Save } from 'lucide-react';

export default function EditRulePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [rule, setRule] = useState<ParseRule | null>(null);
  const [ruleConfig, setRuleConfig] = useState<RuleConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/rules/${id}`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setRule(data.data);
          setRuleConfig(data.data.ruleConfig);
        } else {
          showToast('error', '规则不存在');
          router.push('/rules');
        }
      })
      .catch(() => showToast('error', '加载规则失败'))
      .finally(() => setLoading(false));
  }, [id, router]);

  const handleSave = async () => {
    if (!rule || !ruleConfig) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/rules/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: rule.name,
          description: rule.description,
          fileType: rule.fileType,
          ruleConfig,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', '规则已更新');
        router.push('/rules');
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      showToast('error', `保存失败: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner text="加载规则..." />;
  if (!rule) return null;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/" className="text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)]">首页</Link>
        <ChevronRight className="w-4 h-4 text-[var(--color-text-placeholder)]" />
        <Link href="/rules" className="text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)]">解析规则</Link>
        <ChevronRight className="w-4 h-4 text-[var(--color-text-placeholder)]" />
        <span className="text-[var(--color-text-primary)] font-medium">{rule.name}</span>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">编辑规则: {rule.name}</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            返回
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-dark)] transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? '保存中...' : '保存更新'}
          </button>
        </div>
      </div>

      <RuleEditor initialConfig={ruleConfig || undefined} onConfigChange={setRuleConfig} />
    </div>
  );
}
