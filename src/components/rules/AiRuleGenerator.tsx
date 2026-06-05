'use client';

import { useState } from 'react';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { showToast } from '@/components/shared/Toast';
import { AiAnalysisResult, RuleConfig } from '@/types/rule';
import { Sparkles, AlertCircle, CheckCircle2, HelpCircle, ArrowRight } from 'lucide-react';

interface AiRuleGeneratorProps {
  file: File | null;
  onRuleGenerated: (result: AiAnalysisResult) => void;
}

const confidenceConfig = {
  high: { color: 'text-green-600 bg-green-50', icon: CheckCircle2, label: '高置信度' },
  medium: { color: 'text-yellow-600 bg-yellow-50', icon: HelpCircle, label: '推测匹配' },
  low: { color: 'text-red-600 bg-red-50', icon: AlertCircle, label: '需确认' },
};

export function AiRuleGenerator({ file, onRuleGenerated }: AiRuleGeneratorProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AiAnalysisResult | null>(null);

  const handleGenerate = async () => {
    if (!file) {
      setError('请先上传文件');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'AI分析失败');
      }

      setResult(data.data);
      onRuleGenerated(data.data);
      showToast('success', 'AI分析完成，请确认并微调规则');
    } catch (err: any) {
      setError(err.message);
      showToast('error', `AI分析失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-[var(--color-border)] p-8">
        <LoadingSpinner text="AI正在分析文件结构，生成解析规则..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl border border-[var(--color-border)] p-6">
        <div className="flex items-start gap-3 p-4 rounded-lg bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)]">
          <AlertCircle className="w-5 h-5 text-[var(--color-danger)] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-[var(--color-danger)]">AI分析失败</p>
            <p className="text-xs text-[var(--color-text-secondary)] mt-1">{error}</p>
            <button
              onClick={handleGenerate}
              className="mt-3 px-4 py-1.5 text-xs rounded-lg bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-dark)] transition-colors"
            >
              重试
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="bg-white rounded-xl border border-[var(--color-border)] p-6">
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-purple-50 flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-purple-500" />
          </div>
          <h3 className="text-base font-semibold text-[var(--color-text-primary)] mb-2">AI 辅助生成规则</h3>
          <p className="text-sm text-[var(--color-text-tertiary)] mb-6 max-w-md mx-auto">
            AI将分析文件结构，自动识别字段映射、跳过行、聚合模式等，生成推荐规则配置供您确认和微调
          </p>
          <button
            onClick={handleGenerate}
            disabled={!file}
            className="flex items-center gap-2 mx-auto px-5 py-2.5 text-sm rounded-lg bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-dark)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Sparkles className="w-4 h-4" />
            {file ? '开始AI分析' : '请先上传文件'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // AI 分析结果展示
  return (
    <div className="bg-white rounded-xl border border-[var(--color-border)] p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-purple-500" />
        <h3 className="text-base font-semibold text-[var(--color-text-primary)]">AI 分析结果</h3>
      </div>

      {/* 结构分析 */}
      <div className="p-4 rounded-lg bg-[var(--color-surface-secondary)]">
        <p className="text-sm font-medium text-[var(--color-text-primary)] mb-1">文件结构分析</p>
        <p className="text-sm text-[var(--color-text-secondary)]">{result.analysis}</p>
      </div>

      {/* 置信度 */}
      <div>
        <p className="text-sm font-medium text-[var(--color-text-primary)] mb-2">字段置信度</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {Object.entries(result.confidence).map(([field, level]) => {
            const config = confidenceConfig[level] || confidenceConfig.low;
            const Icon = config.icon;
            return (
              <div key={field} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${config.color}`}>
                <Icon className="w-3.5 h-3.5" />
                <span>
                  <span className="font-medium">{field}</span>
                  <span className="opacity-70 ml-1">({config.label})</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-[var(--color-text-tertiary)]">
        AI生成的规则已填入下方表单，请确认各字段映射是否正确，特别是<span className="text-yellow-600">黄色</span>和<span className="text-red-600">红色</span>标记的字段
      </p>
    </div>
  );
}
