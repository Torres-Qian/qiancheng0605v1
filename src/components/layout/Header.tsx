'use client';

import Link from 'next/link';
import { Menu, Bell } from 'lucide-react';

interface HeaderProps {
  onMenuClick?: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  return (
    <header className="sticky top-0 z-20 h-16 bg-white/80 backdrop-blur-md border-b border-[var(--color-border)] flex items-center justify-between px-4 lg:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-lg hover:bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)]"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">万能导入</h1>
      </div>

      <div className="flex items-center gap-2">
        <button className="p-2 rounded-lg hover:bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] relative">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[var(--color-danger)]"></span>
        </button>
        <div className="w-8 h-8 rounded-full bg-[var(--color-primary-light)] flex items-center justify-center text-[var(--color-primary)] font-medium text-sm">
          U
        </div>
      </div>
    </header>
  );
}
