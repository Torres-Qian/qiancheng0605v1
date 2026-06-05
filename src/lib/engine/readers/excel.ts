import * as XLSX from 'xlsx';
import { RawDataGrid } from '@/types/rule';

// 服务端版本：接收 ArrayBuffer 而非 File 对象
export function readExcelBuffer(buffer: ArrayBuffer, fileName: string): RawDataGrid {
  const data = new Uint8Array(buffer);
  const workbook = XLSX.read(data, { type: 'array' });
  const sheetNames = workbook.SheetNames;
  const sheets: Record<string, RawDataGrid> = {};

  for (const sheetName of sheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json<string[]>(worksheet, {
      header: 1,
      defval: '',
      raw: false,
    });

    const rows = jsonData as string[][];
    const maxCols = Math.max(0, ...rows.map(r => r.length));

    const paddedRows = rows.map(r => {
      const padded = [...r];
      while (padded.length < maxCols) padded.push('');
      return padded;
    });

    sheets[sheetName] = {
      headers: paddedRows[0] || [],
      rows: paddedRows,
      rawText: '',
      metadata: {
        fileName,
        fileType: 'excel',
        sheetCount: 1,
        totalRows: paddedRows.length,
        totalCols: maxCols,
      },
    };
  }

  const firstSheet = sheets[sheetNames[0]];
  return {
    ...firstSheet,
    metadata: {
      fileName,
      fileType: 'excel',
      sheetCount: sheetNames.length,
      totalRows: firstSheet.rows.length,
      totalCols: firstSheet.rows[0]?.length || 0,
    },
    sheets,
  };
}

// 浏览器版本：保留 FileReader 方式
export async function readExcelFile(file: File): Promise<RawDataGrid> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const result = readExcelBuffer(e.target?.result as ArrayBuffer, file.name);
        resolve(result);
      } catch (err) {
        reject(new Error(`Excel文件解析失败: ${err instanceof Error ? err.message : '未知错误'}`));
      }
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsArrayBuffer(file);
  });
}
