'use client';

import { createContext, useContext, useState, ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';
import { X } from 'lucide-react';

interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'default';
  onConfirm: () => void | Promise<void>;
}

interface ConfirmDialogContextType {
  confirm: (options: ConfirmDialogOptions) => void;
}

const ConfirmDialogContext = createContext<ConfirmDialogContextType | null>(null);

export function useConfirm() {
  const ctx = useContext(ConfirmDialogContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmDialogProvider');
  return ctx.confirm;
}

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<(ConfirmDialogOptions & { open: boolean }) | null>(null);
  const [loading, setLoading] = useState(false);

  const confirm = (options: ConfirmDialogOptions) => {
    setDialog({ ...options, open: true });
  };

  const handleConfirm = async () => {
    if (!dialog) return;
    setLoading(true);
    try {
      await dialog.onConfirm();
    } finally {
      setLoading(false);
      setDialog(null);
    }
  };

  return (
    <ConfirmDialogContext.Provider value={{ confirm }}>
      {children}
      {dialog?.open && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDialog(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 animate-slide-in">
            <button
              onClick={() => setDialog(null)}
              className="absolute top-4 right-4 p-1 rounded-md hover:bg-[var(--color-surface-hover)] text-[var(--color-text-tertiary)]"
            >
              <X className="w-4 h-4" />
            </button>
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">{dialog.title}</h3>
            <p className="text-sm text-[var(--color-text-secondary)] mb-6">{dialog.message}</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDialog(null)}
                className="px-4 py-2 text-sm rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors"
              >
                {dialog.cancelText || '取消'}
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading}
                className={cn(
                  'px-4 py-2 text-sm rounded-lg text-white transition-colors disabled:opacity-50',
                  dialog.variant === 'danger'
                    ? 'bg-[var(--color-danger)] hover:bg-red-600'
                    : 'bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)]'
                )}
              >
                {loading ? '处理中...' : (dialog.confirmText || '确认')}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmDialogContext.Provider>
  );
}
