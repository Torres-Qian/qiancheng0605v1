'use client';

import { useState, useCallback, DragEvent } from 'react';
import { cn } from '@/lib/utils/cn';
import { Upload, FileSpreadsheet, FileText, File, X, AlertCircle } from 'lucide-react';
import { validateFileType, formatFileSize, detectFileType } from '@/lib/utils/file';

interface FileDropZoneProps {
  onFileSelected: (file: File) => void;
  selectedFile: File | null;
  onClear: () => void;
}

const fileIcons: Record<string, React.ElementType> = {
  excel: FileSpreadsheet,
  word: FileText,
  pdf: File,
};

const fileColors: Record<string, string> = {
  excel: 'text-green-600 bg-green-50 border-green-200',
  word: 'text-blue-600 bg-blue-50 border-blue-200',
  pdf: 'text-red-600 bg-red-50 border-red-200',
};

export function FileDropZone({ onFileSelected, selectedFile, onClear }: FileDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, []);

  const processFile = (file: File) => {
    setError(null);
    const result = validateFileType(file);
    if (!result.valid) {
      setError(result.error || '文件无效');
      return;
    }
    onFileSelected(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const fileType = selectedFile ? detectFileType(selectedFile.name) : null;
  const Icon = fileType ? fileIcons[fileType] : File;

  if (selectedFile) {
    return (
      <div className={cn(
        'flex items-center gap-4 p-4 rounded-xl border-2',
        fileType ? fileColors[fileType] : 'border-[var(--color-border)]'
      )}>
        <div className="w-12 h-12 rounded-lg bg-white border flex items-center justify-center flex-shrink-0">
          <Icon className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-[var(--color-text-primary)] text-sm truncate">{selectedFile.name}</p>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">{formatFileSize(selectedFile.size)}</p>
        </div>
        <button
          onClick={onClear}
          className="p-2 rounded-lg hover:bg-white/60 transition-colors text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)]"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    );
  }

  return (
    <div>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'relative border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-200',
          isDragging
            ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]'
            : 'border-[var(--color-border)] hover:border-[var(--color-primary)] hover:bg-[var(--color-surface-hover)]'
        )}
      >
        <input
          type="file"
          onChange={handleFileInput}
          accept=".xlsx,.xls,.docx,.pdf"
          className="absolute inset-0 opacity-0 cursor-pointer"
        />
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--color-surface-hover)] flex items-center justify-center">
          <Upload className={cn(
            'w-8 h-8 transition-colors',
            isDragging ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-placeholder)]'
          )} />
        </div>
        <p className="text-sm font-medium text-[var(--color-text-secondary)] mb-1">
          拖拽文件到此处，或<span className="text-[var(--color-primary)]">点击上传</span>
        </p>
        <p className="text-xs text-[var(--color-text-tertiary)]">
          支持 Excel (.xlsx/.xls)、Word (.docx)、PDF 格式，最大 10MB
        </p>
      </div>

      {error && (
        <div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] text-sm text-[var(--color-danger)]">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}
