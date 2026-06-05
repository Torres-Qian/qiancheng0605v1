'use client';

import Link from 'next/link';
import { Upload, Settings, ListOrdered, ArrowRight, FileSpreadsheet, FileText, File } from 'lucide-react';

const quickActions = [
  { href: '/import', label: '导入下单', desc: '上传文件开始批量下单', icon: Upload, color: 'bg-[var(--color-primary-light)] text-[var(--color-primary)]' },
  { href: '/rules', label: '解析规则', desc: '管理AI辅助解析规则', icon: Settings, color: 'bg-purple-50 text-purple-500' },
  { href: '/waybills', label: '运单列表', desc: '查看已导入的运单记录', icon: ListOrdered, color: 'bg-orange-50 text-orange-500' },
];

const supportFormats = [
  { label: 'Excel', ext: '.xlsx .xls', icon: FileSpreadsheet, desc: '支持多Sheet、矩阵转置、卡片式等复杂格式' },
  { label: 'Word', ext: '.docx', icon: FileText, desc: '支持纯文本段落式、分隔线划界' },
  { label: 'PDF', ext: '.pdf', icon: File, desc: '支持多页多单、表格+文本混合' },
];

export default function HomePage() {
  return (
    <div className="space-y-6">
      {/* 欢迎卡片 */}
      <div className="bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-dark)] rounded-xl p-8 text-white">
        <h1 className="text-2xl font-bold mb-2">万能导入 V2</h1>
        <p className="text-white/80 text-sm max-w-lg">
          智能多格式批量下单系统 —— 通过规则引擎 + AI大模型，实现 Excel/Word/PDF 任意格式文件的智能解析与批量下单
        </p>
        <Link
          href="/import"
          className="inline-flex items-center gap-2 mt-4 px-5 py-2.5 bg-white text-[var(--color-primary)] rounded-lg font-medium text-sm hover:bg-white/95 transition-colors"
        >
          <Upload className="w-4 h-4" />
          开始导入
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {/* 快捷入口 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {quickActions.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="bg-white rounded-xl border border-[var(--color-border)] p-5 hover:shadow-md hover:border-[var(--color-primary)] transition-all duration-200 group"
          >
            <div className={`w-10 h-10 rounded-lg ${action.color} flex items-center justify-center mb-3`}>
              <action.icon className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-[var(--color-text-primary)] group-hover:text-[var(--color-primary)] transition-colors">
              {action.label}
            </h3>
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1">{action.desc}</p>
          </Link>
        ))}
      </div>

      {/* 支持格式 */}
      <div className="bg-white rounded-xl border border-[var(--color-border)] p-6">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">支持的文件格式</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {supportFormats.map((fmt) => (
            <div key={fmt.label} className="flex items-start gap-3 p-4 rounded-lg bg-[var(--color-surface-secondary)]">
              <div className="w-10 h-10 rounded-lg bg-white border border-[var(--color-border)] flex items-center justify-center flex-shrink-0">
                <fmt.icon className="w-5 h-5 text-[var(--color-text-secondary)]" />
              </div>
              <div>
                <h4 className="font-medium text-[var(--color-text-primary)] text-sm">{fmt.label}</h4>
                <p className="text-xs text-[var(--color-primary)] font-mono mt-0.5">{fmt.ext}</p>
                <p className="text-xs text-[var(--color-text-tertiary)] mt-1">{fmt.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 核心能力 */}
      <div className="bg-white rounded-xl border border-[var(--color-border)] p-6">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">核心能力</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { title: '规则引擎驱动', desc: '通用规则描述语言，新增格式代码零改动' },
            { title: 'AI辅助生成规则', desc: '大模型自动分析文件结构，生成推荐规则' },
            { title: '复杂结构处理', desc: '矩阵转置、卡片拆分、跨行聚合、复合单元格' },
            { title: '高性能渲染', desc: '1000条数据3秒内渲染，虚拟列表不卡顿' },
          ].map((item) => (
            <div key={item.title} className="flex items-start gap-3 p-3 rounded-lg">
              <div className="w-2 h-2 rounded-full bg-[var(--color-primary)] mt-1.5 flex-shrink-0" />
              <div>
                <h4 className="text-sm font-medium text-[var(--color-text-primary)]">{item.title}</h4>
                <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
