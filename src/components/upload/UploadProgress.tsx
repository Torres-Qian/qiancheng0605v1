'use client';

import { ProgressBar } from '@/components/shared/ProgressBar';
import { Loader2 } from 'lucide-react';

interface UploadProgressProps {
  percent: number;
  current: number;
  total: number;
  status: 'parsing' | 'validating' | 'done';
}

export function UploadProgress({ percent, current, total, status }: UploadProgressProps) {
  const statusText = {
    parsing: '正在解析文件...',
    validating: '正在校验数据...',
    done: '解析完成',
  };

  return (
    <div className="bg-white rounded-xl border border-[var(--color-border)] p-6">
      <div className="flex items-center gap-3 mb-4">
        {status !== 'done' && <Loader2 className="w-5 h-5 text-[var(--color-primary)] animate-spin" />}
        <div>
          <p className="text-sm font-medium text-[var(--color-text-primary)]">{statusText[status]}</p>
          <p className="text-xs text-[var(--color-text-tertiary)]">
            {current} / {total} 条
          </p>
        </div>
      </div>
      <ProgressBar percent={percent} />
    </div>
  );
}
