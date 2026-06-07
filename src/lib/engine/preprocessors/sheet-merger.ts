import { RawDataGrid } from '@/types/rule';

// 合并多个Sheet的数据（只保留第一个Sheet的表头，跳过后续Sheet的表头行）
export function mergeSheets(data: RawDataGrid, headerRowIndex: number = 0): RawDataGrid {
  if (!data.sheets || Object.keys(data.sheets).length <= 1) return data;

  const allRows: string[][] = [];
  const sheetNames = Object.keys(data.sheets);
  let isFirstSheet = true;

  for (const sheetName of sheetNames) {
    const sheet = data.sheets[sheetName];
    if (isFirstSheet) {
      // 第一个Sheet保留所有行（包含表头）
      allRows.push(...sheet.rows);
      isFirstSheet = false;
    } else {
      // 后续Sheet跳过表头行
      const dataRows = sheet.rows.slice(headerRowIndex + 1);
      allRows.push(...dataRows);
    }
  }

  return {
    headers: data.headers,
    rows: allRows,
    rawText: allRows.map(r => r.join('\t')).join('\n'),
    metadata: {
      ...data.metadata,
      totalRows: allRows.length,
    },
    sheets: data.sheets,
  };
}
