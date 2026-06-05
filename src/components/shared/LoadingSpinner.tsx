'use client';

import { cn } from '@/lib/utils/cn';
import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
  className?: string;
}

export function LoadingSpinner({ size = 'md', text, className }: LoadingSpinnerProps) {
  const sizeMap = { sm: 'w-4 h-4', md: 'w-8 h-8', lg: 'w-12 h-12' };
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-12', className)}>
      <Loader2 className={cn(sizeMap[size], 'text-[var(--color-primary)] animate-spin')} />
      {text && <p className="text-sm text-[var(--color-text-tertiary)]">{text}</p>}
    </div>
  );
}
