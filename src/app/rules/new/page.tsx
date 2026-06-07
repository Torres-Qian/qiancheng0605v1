'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FileDropZone } from '@/components/upload/FileDropZone';
import { AiRuleGenerator } from '@/components/rules/AiRuleGenerator';
import { RuleEditor } from '@/components/rules/RuleEditor';
import { PreviewPanel } from '@/components/rules/PreviewPanel';
import { showToast } from '@/components/shared/Toast';
import { AiAnalysisResult, RuleConfig, FileType } from '@/types/rule';
import { detectFileType } from '@/lib/utils/file';
import { ChevronRight, ArrowLeft, Save, Play, Eye } from 'lucide-react';

export default function NewRulePage() {
  const router = useRouter();
  const [step, setStep] = useState<'upload' | 'ai_generate' | 'edit'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [aiResult, setAiResult] = useState<AiAnalysisResult | null>(null);
  const [ruleConfig, setRuleConfig] = useState<RuleConfig | null>(null);
  const [ruleName, setRuleName] = useState('');
  const [ruleDesc, setRuleDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(true);

  const detectedType = file ? detectFileType(file.name) : undefined;
  const fileType: FileType | undefined = detectedType === 'unknown' ? undefined : detectedType;

  // 从导入页传来的文件名
  const savedFileName = typeof window !== 'undefined' ? sessionStorage.getItem('newRuleFileName') : null;

  const handleFileSelected = (f: File) => {
    setFile(f);
    setRuleName(f.name.replace(/\.[^.]+$/, '') + ' 解析规则');
  };

  const handleAiGenerated = (result: AiAnalysisResult) => {
    setAiResult(result);
    setRuleConfig(result.suggestedRule);
    setStep('edit');
  };

  const handleSave = async () => {
    if (!ruleConfig || !ruleName.trim()) {
      showToast('warning', '请输入规则名称');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: ruleName,
          description: ruleDesc,
          fileType: fileType || 'excel',
          ruleConfig,
          createdBy: aiResult ? 'ai_assisted' : 'manual',
        }),
      });

      const data = await res.json();
      if (data.success) {
        sessionStorage.removeItem('newRuleFileName');
        showToast('success', '规则保存成功');
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

  return (
    <div className="space-y-6" style={{ width: '100%' }}>
      <div className="flex items-center gap-2 text-sm">
        <Link href="/" className="text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)]">首页</Link>
        <ChevronRight className="w-4 h-4 text-[var(--color-text-placeholder)]" />
        <Link href="/rules" className="text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)]">解析规则</Link>
        <ChevronRight className="w-4 h-4 text-[var(--color-text-placeholder)]" />
        <span className="text-[var(--color-text-primary)] font-medium">新建规则</span>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">新建解析规则</h1>
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
            disabled={!ruleConfig || saving}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-dark)] transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? '保存中...' : '保存规则'}
          </button>
        </div>
      </div>

      {/* 规则基本信息 */}
      <div className="bg-white rounded-xl border border-[var(--color-border)] p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-[var(--color-text-tertiary)] mb-1">规则名称 *</label>
            <input
              type="text"
              value={ruleName}
              onChange={e => setRuleName(e.target.value)}
              placeholder="如：黎明屯配送单解析规则"
              className="w-full px-3 py-1.5 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:border-[var(--color-primary)]"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-text-tertiary)] mb-1">描述</label>
            <input
              type="text"
              value={ruleDesc}
              onChange={e => setRuleDesc(e.target.value)}
              placeholder="规则用途说明"
              className="w-full px-3 py-1.5 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:border-[var(--color-primary)]"
            />
          </div>
        </div>
      </div>

      {/* 步骤流程 */}
      {step === 'upload' && !file && (
        <div className="bg-white rounded-xl border border-[var(--color-border)] p-6">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-4">上传样例文件</h2>
          <p className="text-sm text-[var(--color-text-tertiary)] mb-4">
            上传一份需要创建解析规则的文件，AI将分析其结构并生成推荐规则
          </p>
          <FileDropZone
            onFileSelected={handleFileSelected}
            selectedFile={file}
            onClear={() => { setFile(null); setAiResult(null); setRuleConfig(null); }}
          />
        </div>
      )}

      {file && step === 'upload' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-[var(--color-border)] p-6">
            <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-4">已选择文件</h2>
            <FileDropZone
              onFileSelected={handleFileSelected}
              selectedFile={file}
              onClear={() => { setFile(null); setAiResult(null); setRuleConfig(null); }}
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep('ai_generate')}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm rounded-xl bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-dark)] transition-colors font-medium"
            >
              <Play className="w-4 h-4" />
              AI智能分析生成规则
            </button>
            <button
              onClick={() => setStep('edit')}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm rounded-xl border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors"
            >
              手动配置规则
            </button>
          </div>
        </div>
      )}

      {/* AI 生成 */}
      {step === 'ai_generate' && (
        <AiRuleGenerator file={file} onRuleGenerated={handleAiGenerated} />
      )}

      {/* 规则编辑器 */}
      {(step === 'edit' || aiResult) && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">规则配置</h2>
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors"
            >
              <Eye className="w-4 h-4" />
              {showPreview ? '隐藏预览' : '预览效果'}
            </button>
          </div>
          <RuleEditor
            initialConfig={ruleConfig || undefined}
            onConfigChange={setRuleConfig}
            aiResult={aiResult}
            fileType={fileType}
          />
          {showPreview && (
            <PreviewPanel
              file={file}
              ruleConfig={ruleConfig}
              onFileChange={setFile}
            />
          )}
        </>
      )}
    </div>
  );
}
