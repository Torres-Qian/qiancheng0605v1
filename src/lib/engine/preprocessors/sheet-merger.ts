import { RawDataGrid } from '@/types/rule';

// 合并多个Sheet的数据
export function mergeSheets(data: RawDataGrid): RawDataGrid {
  if (!data.sheets || Object.keys(data.sheets).length <= 1) return data;

  const allRows: string[][] = [];
  const sheetNames = Object.keys(data.sheets);

  for (const sheetName of sheetNames) {
    const sheet = data.sheets[sheetName];
    allRows.push(...sheet.rows);
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
