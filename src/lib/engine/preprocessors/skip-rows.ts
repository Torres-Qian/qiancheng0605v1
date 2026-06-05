import { RawDataGrid } from '@/types/rule';
import { PreprocessResult } from '../types';

export function skipRows(data: RawDataGrid, top: number, bottom: number): PreprocessResult {
  const skippedRows: number[] = [];
  let rows = [...data.rows];

  // 跳过顶部行
  if (top > 0) {
    for (let i = 0; i < Math.min(top, rows.length); i++) {
      skippedRows.push(i);
    }
    rows = rows.slice(top);
  }

  // 跳过底部行
  if (bottom > 0) {
    const start = Math.max(0, rows.length - bottom);
    for (let i = start; i < rows.length; i++) {
      skippedRows.push(i + top);
    }
    rows = rows.slice(0, rows.length - bottom);
  }

  return {
    data: { ...data, rows },
    skippedRows,
  };
}

export function skipPatternRows(data: RawDataGrid, pattern: string): PreprocessResult {
  if (!pattern) return { data, skippedRows: [] };

  const regex = new RegExp(pattern, 'i');
  const skippedRows: number[] = [];
  const filteredRows = data.rows.filter((row, index) => {
    const rowText = row.join(' ');
    if (regex.test(rowText)) {
      skippedRows.push(index);
      return false;
    }
    return true;
  });

  return {
    data: { ...data, rows: filteredRows },
    skippedRows,
  };
}
