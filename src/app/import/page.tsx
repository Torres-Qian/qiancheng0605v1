'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FileDropZone } from '@/components/upload/FileDropZone';
import { UploadProgress } from '@/components/upload/UploadProgress';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { showToast } from '@/components/shared/Toast';
import { useImportStore } from '@/stores/import-store';
import { executeParse } from '@/lib/engine';
import { ParseRule, RuleConfig } from '@/types/rule';
import { detectFileType } from '@/lib/utils/file';
import { cn } from '@/lib/utils/cn';
import { ArrowLeft, Plus, ChevronRight, FileText, Settings, Sparkles, Play, Check } from 'lucide-react';
import Link from 'next/link';

export default function ImportPage() {
  const router = useRouter();
  const store = useImportStore();
  const [rules, setRules] = useState<ParseRule[]>([]);
  const [loadingRules, setLoadingRules] = useState(true);
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseProgress, setParseProgress] = useState({ current: 0, total: 0, percent: 0 });

  // 加载规则列表
  useEffect(() => {
    fetch('/api/rules')
      .then(r => r.json())
      .then(data => {
        if (data.success) setRules(data.data);
      })
      .catch(() => showToast('error', '加载规则列表失败'))
      .finally(() => setLoadingRules(false));
  }, []);

  const handleFileSelected = (file: File) => {
    store.setFile(file);
    store.setStep('select_rule');
  };

  const handleClearFile = () => {
    store.reset();
    setSelectedRuleId(null);
  };

  // 使用已有规则执行解析
  const handleUseRule = async (rule: ParseRule) => {
    if (!store.file) return;
    store.setSelectedRule(rule);
    store.setStep('parsing');
    setParsing(true);
    setParseProgress({ current: 0, total: 100, percent: 0 });

    try {
      // 模拟进度
      const progressInterval = setInterval(() => {
        setParseProgress(prev => ({
          current: Math.min(prev.current + 10, 90),
          total: 100,
          percent: Math.min(prev.percent + 10, 90),
        }));
      }, 100);

      const result = await executeParse(store.file, rule.ruleConfig as RuleConfig);

      clearInterval(progressInterval);
      setParseProgress({ current: 100, total: 100, percent: 100 });

      if (result.parseErrors.length > 0) {
        showToast('error', `解析出错: ${result.parseErrors[0]}`);
        store.setStep('select_rule');
        setParsing(false);
        return;
      }

      if (result.records.length === 0) {
        const warning = result.parseWarnings.length > 0
          ? result.parseWarnings[0]
          : '未提取到任何数据，请检查规则"字段映射"中SKU字段列名是否与文件匹配';
        showToast('warning', warning);
        store.setStep('select_rule');
        setParsing(false);
        return;
      }

      store.setRecords(result.records);
      store.setValidationErrors(result.validationErrors);
      store.setBatchId(crypto.randomUUID());
      store.setStep('preview');

      showToast('success', `解析完成，共 ${result.records.length} 条记录`);

      // 跳转到预览页
      setTimeout(() => router.push('/preview'), 500);
    } catch (err: any) {
      showToast('error', `解析失败: ${err.message}`);
      store.setStep('select_rule');
    } finally {
      setParsing(false);
    }
  };

  // 新建规则
  const handleNewRule = () => {
    if (store.file) {
      sessionStorage.setItem('newRuleFileName', store.file.name);
      router.push('/rules/new');
    }
  };

  // 异步导入模式：Blob 直传 + JSON 创建任务（P50 < 100ms）
  // 大文件（> 4MB）自动切分为 5000 行/片，每片独立上传
  const handleAsyncImport = async () => {
    if (!store.file || !selectedRuleId) return;

    setParsing(true);
    setParseProgress({ current: 0, total: 100, percent: 0 });

    try {
      const progressInterval = setInterval(() => {
        setParseProgress(prev => ({
          current: Math.min(prev.current + 5, 85),
          total: 100,
          percent: Math.min(prev.percent + 5, 85),
        }));
      }, 100);

      const file = store.file;
      const CHUNK_ROWS = 5000;
      const CHUNK_SIZE_MB = 4; // Vercel 4.5MB 限制，留 0.5MB 给 multipart 开销
      const needSplit = file.size > CHUNK_SIZE_MB * 1024 * 1024;

      let taskIds: string[] = [];
      let totalRows = 0;

      if (needSplit && file.name.match(/\.xlsx?$/i)) {
        // 大文件切分：读取 Excel，按 5000 行切分为多个小文件
        const XLSX = await import("xlsx");
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const allData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
        const headerRow = allData[0];
        const dataRows = allData.slice(1);
        const chunks: any[][][] = [];

        for (let i = 0; i < dataRows.length; i += CHUNK_ROWS) {
          chunks.push([headerRow, ...dataRows.slice(i, i + CHUNK_ROWS)]);
        }

        totalRows = dataRows.length;
        setParseProgress({ current: 10, total: 100, percent: 10 });

        for (let idx = 0; idx < chunks.length; idx++) {
          const chunkData = chunks[idx];
          const chunkWorkbook = XLSX.utils.book_new();
          const chunkSheet = XLSX.utils.aoa_to_sheet(chunkData);
          XLSX.utils.book_append_sheet(chunkWorkbook, chunkSheet, sheetName);
          const chunkBuffer = XLSX.write(chunkWorkbook, { bookType: "xlsx", type: "array" });
          const chunkFile = new File(
            [new Uint8Array(chunkBuffer)],
            `${file.name.replace(/\.xlsx?$/i, "")}_part${idx + 1}_of_${chunks.length}.xlsx`,
            { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
          );

          // Blob 直传
          const blobFd = new FormData();
          blobFd.append("file", chunkFile);
          const blobRes = await fetch("/api/blob", { method: "POST", body: blobFd });
          const blobData = await blobRes.json();
          if (!blobData.success || !blobData.data?.url) {
            throw new Error(`分片 ${idx + 1} 上传失败`);
          }

          // 创建任务
          const taskRes = await fetch("/api/import-tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              blobUrl: blobData.data.url,
              fileName: chunkFile.name,
              parseRuleId: selectedRuleId,
            }),
          });
          const taskData = await taskRes.json();
          if (taskData.success && taskData.data?.taskId) {
            taskIds.push(taskData.data.taskId);
          }

          setParseProgress({
            current: Math.min(30 + idx * 30, 90),
            total: 100,
            percent: Math.min(30 + idx * 30, 90),
          });
        }
      } else {
        // 小文件直接 Blob 上传
        const blobFd = new FormData();
        blobFd.append("file", file);
        const blobRes = await fetch("/api/blob", { method: "POST", body: blobFd });
        const blobData = await blobRes.json();
        if (!blobData.success || !blobData.data?.url) {
          throw new Error("文件上传失败");
        }

        const taskRes = await fetch("/api/import-tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            blobUrl: blobData.data.url,
            fileName: file.name,
            parseRuleId: selectedRuleId,
          }),
        });
        const taskData = await taskRes.json();
        if (taskData.success && taskData.data?.taskId) {
          taskIds.push(taskData.data.taskId);
        } else {
          throw new Error(taskData.error || "创建任务失败");
        }
      }

      clearInterval(progressInterval);
      setParseProgress({ current: 100, total: 100, percent: 100 });

      if (taskIds.length === 1) {
        showToast("success", `任务已创建`);
        setTimeout(() => router.push(`/import/${taskIds[0]}`), 300);
      } else {
        showToast("success", `已创建 ${taskIds.length} 个任务，共 ${totalRows} 行`);
        setTimeout(() => router.push(`/import/${taskIds[0]}`), 300);
      }
    } catch (err: any) {
      showToast("error", err.message || "请求失败");
      setParsing(false);
    }
  };

  // 点击开始导入
  const handleStartImport = () => {
    handleAsyncImport();
  };

  const fileType = store.file ? detectFileType(store.file.name) : null;
  const filteredRules = rules.filter(r => !fileType || r.fileType === fileType);

  return (
    <div className="space-y-6" style={{ width: '100%' }}>
      {/* 步骤指示器 */}
      <div className="flex items-center gap-2 text-sm">
        <Link href="/" className="text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)]">首页</Link>
        <ChevronRight className="w-4 h-4 text-[var(--color-text-placeholder)]" />
        <span className="text-[var(--color-text-primary)] font-medium">导入下单</span>
      </div>

      {/* 步骤 1: 上传文件 */}
      <div className="bg-white rounded-xl border border-[var(--color-border)] p-6">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4 flex items-center gap-2">
          <span className="w-7 h-7 rounded-full bg-[var(--color-primary)] text-white text-sm flex items-center justify-center">1</span>
          选择文件
        </h2>
        <FileDropZone
          onFileSelected={handleFileSelected}
          selectedFile={store.file}
          onClear={handleClearFile}
        />
      </div>

      {/* 步骤 2: 选择规则 */}
      {store.step === 'select_rule' && (
        <div className="bg-white rounded-xl border border-[var(--color-border)] p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-[var(--color-primary)] text-white text-sm flex items-center justify-center">2</span>
              选择解析规则
            </h2>
            <button
              onClick={handleNewRule}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-[var(--color-primary-light)] text-[var(--color-primary-darker)] hover:bg-[var(--color-info-border)] transition-colors font-medium"
            >
              <Sparkles className="w-4 h-4" />
              AI新建规则
            </button>
          </div>

          {loadingRules ? (
            <LoadingSpinner size="sm" text="加载规则列表..." />
          ) : filteredRules.length === 0 ? (
            <EmptyState
              icon={<Settings className="w-8 h-8 text-[var(--color-text-placeholder)]" />}
              title="暂无匹配的解析规则"
              description={rules.length === 0 ? '还没有任何规则，点击"AI新建规则"创建第一条' : `没有适用于 ${fileType} 格式的规则`}
              action={
                <button
                  onClick={handleNewRule}
                  className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-dark)] transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  新建规则
                </button>
              }
            />
          ) : (
            <>
              <div className="space-y-2">
                {filteredRules.map(rule => (
                  <button
                    key={rule.id}
                    onClick={() => setSelectedRuleId(selectedRuleId === rule.id ? null : rule.id)}
                    className={cn(
                      'w-full flex items-center justify-between p-4 rounded-lg border transition-all duration-200 group text-left',
                      selectedRuleId === rule.id
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] shadow-sm'
                        : 'border-[var(--color-border)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-light)]'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'w-9 h-9 rounded-lg flex items-center justify-center',
                        selectedRuleId === rule.id ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-surface-hover)]'
                      )}>
                        {selectedRuleId === rule.id ? (
                          <Check className="w-4 h-4 text-white" />
                        ) : (
                          <FileText className="w-4 h-4 text-[var(--color-text-secondary)]" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[var(--color-text-primary)] group-hover:text-[var(--color-primary)] transition-colors">
                          {rule.name}
                        </p>
                        <p className="text-xs text-[var(--color-text-tertiary)]">
                          {rule.fileType} · {rule.createdBy === 'ai_assisted' ? 'AI辅助' : '手动创建'}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className={cn(
                      'w-4 h-4 transition-colors',
                      selectedRuleId === rule.id ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-placeholder)] group-hover:text-[var(--color-primary)]'
                    )} />
                  </button>
                ))}
              </div>

              {/* 开始导入按钮 - 选择规则后显示 */}
              {selectedRuleId && (
                <div className="mt-4 pt-4 border-t border-[var(--color-border)] flex justify-center">
                  <button
                    onClick={handleStartImport}
                    className="inline-flex items-center justify-center gap-2 px-8 py-2.5 text-sm font-medium rounded-lg bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-dark)] transition-colors shadow-sm"
                  >
                    <Play className="w-4 h-4" />
                    开始导入
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* 解析进度 */}
      {parsing && (
        <UploadProgress
          percent={parseProgress.percent}
          current={parseProgress.current}
          total={parseProgress.total}
          status="parsing"
        />
      )}
    </div>
  );
}
