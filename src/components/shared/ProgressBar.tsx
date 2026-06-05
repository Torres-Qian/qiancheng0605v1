'use client';

import { cn } from '@/lib/utils/cn';

interface ProgressBarProps {
  percent: number;
  current?: number;
  total?: number;
  label?: string;
  className?: string;
}

export function ProgressBar({ percent, current, total, label, className }: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, percent));

  return (
    <div className={cn('w-full', className)}>
      {(label || current !== undefined) && (
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-[var(--color-text-secondary)]">
            {label || '处理中...'}
          </span>
          {current !== undefined && total !== undefined && (
            <span className="text-sm font-medium text-[var(--color-primary)]">
              {current}/{total} ({Math.round(pct)}%)
            </span>
          )}
        </div>
      )}
      <div className="w-full h-2 bg-[var(--color-surface-hover)] rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500 ease-out',
            pct < 100 ? 'bg-[var(--color-primary)] animate-progress-pulse' : 'bg-[var(--color-success)]'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
