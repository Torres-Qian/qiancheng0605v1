'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

let addToastFn: ((type: ToastType, message: string) => void) | null = null;

export function showToast(type: ToastType, message: string) {
  addToastFn?.(type, message);
}

const iconMap = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const colorMap = {
  success: 'bg-green-50 border-green-200 text-green-800',
  error: 'bg-[var(--color-danger-bg)] border-[var(--color-danger-border)] text-[var(--color-danger)]',
  warning: 'bg-[var(--color-warning-bg)] border-[var(--color-warning-border)] text-[var(--color-warning)]',
  info: 'bg-[var(--color-info-bg)] border-[var(--color-info-border)] text-[var(--color-primary-darker)]',
};

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  useEffect(() => {
    addToastFn = (type: ToastType, message: string) => {
      const id = Date.now().toString() + Math.random().toString(36).slice(2);
      setToasts(prev => [...prev, { id, type, message }]);
      const timer = setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
        timersRef.current.delete(id);
      }, 3500);
      timersRef.current.set(id, timer);
    };
    return () => {
      timersRef.current.forEach(t => clearTimeout(t));
    };
  }, []);

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => {
        const Icon = iconMap[toast.type];
        return (
          <div
            key={toast.id}
            className={cn(
              'animate-slide-in pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg min-w-[320px] max-w-[480px]',
              colorMap[toast.type]
            )}
          >
            <Icon className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm flex-1">{toast.message}</span>
            <button
              onClick={() => {
                setToasts(prev => prev.filter(t => t.id !== toast.id));
                const timer = timersRef.current.get(toast.id);
                if (timer) clearTimeout(timer);
              }}
              className="flex-shrink-0 opacity-60 hover:opacity-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
