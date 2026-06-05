'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import {
  LayoutDashboard, Upload, FileText, Settings, ListOrdered, Menu, X
} from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { href: '/', label: '工作台', icon: LayoutDashboard },
  { href: '/import', label: '导入下单', icon: Upload },
  { href: '/rules', label: '解析规则', icon: Settings },
  { href: '/waybills', label: '运单列表', icon: ListOrdered },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      {/* 移动端遮罩 */}
      <div
        className={cn(
          'fixed inset-0 bg-black/20 z-40 lg:hidden',
          collapsed ? 'hidden' : 'block'
        )}
        onClick={() => setCollapsed(true)}
      />

      <aside
        className={cn(
          'fixed top-0 left-0 z-50 h-full bg-white border-r border-[var(--color-border)] flex flex-col transition-all duration-300',
          'lg:sticky lg:top-0 lg:z-30',
          collapsed ? 'w-[72px]' : 'w-[240px]'
        )}
      >
        {/* Logo */}
        <div className={cn(
          'flex items-center h-16 px-4 border-b border-[var(--color-border)]',
          collapsed ? 'justify-center' : 'justify-between'
        )}>
          {!collapsed && (
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[var(--color-primary)] flex items-center justify-center">
                <Upload className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold text-[var(--color-text-primary)] text-sm">万能导入</span>
            </Link>
          )}
          {collapsed && (
            <div className="w-8 h-8 rounded-lg bg-[var(--color-primary)] flex items-center justify-center">
              <Upload className="w-4 h-4 text-white" />
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="lg:hidden p-1 rounded-md hover:bg-[var(--color-surface-hover)] text-[var(--color-text-tertiary)]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-4 px-2 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 group',
                  isActive
                    ? 'bg-[var(--color-primary-light)] text-[var(--color-primary-darker)] font-medium'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]'
                )}
                title={item.label}
              >
                <item.icon className={cn('w-5 h-5 flex-shrink-0', isActive ? 'text-[var(--color-primary)]' : '')} />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        {!collapsed && (
          <div className="px-4 py-3 border-t border-[var(--color-border)]">
            <p className="text-xs text-[var(--color-text-tertiary)]">万能导入 V2</p>
          </div>
        )}
      </aside>
    </>
  );
}
