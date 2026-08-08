import * as XLSX from 'xlsx';
import { RawDataGrid } from '@/types/rule';

/**
 * 轻量级行数预扫描：解析 workbook 但跳过 sheet_to_json 全量转换
 * 直接读取每个 sheet 的 !ref 范围，10000 行 Excel 预扫描 < 500ms
 * 返回值为「所有 Sheet 的行数之和（含表头行）」
 * 注意：不能使用 sheetRows 选项，它会限制 !ref 范围导致返回值失真
 */
export function countExcelRowsQuick(buffer: ArrayBuffer): number {
  const data = new Uint8Array(buffer);
  const workbook = XLSX.read(data, { type: "array", cellFormula: false, cellHTML: false, cellStyles: false });
  let total = 0;
  for (const name of workbook.SheetNames) {
    const ws = workbook.Sheets[name];
    const ref = ws?.["!ref"];
    if (!ref) continue;
    const range = XLSX.utils.decode_range(ref);
    total += Math.max(0, range.e.r - range.s.r + 1);
  }
  return total;
}

// 服务端版本：接收 ArrayBuffer 而非 File 对象
export function readExcelBuffer(buffer: ArrayBuffer, fileName: string): RawDataGrid {
  const data = new Uint8Array(buffer);
  const workbook = XLSX.read(data, { type: 'array' });
  const sheetNames = workbook.SheetNames;
  console.log(`[readExcel] 文件"${fileName}" 共${sheetNames.length}个Sheet: [${sheetNames.join(', ')}]`);
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

    console.log(`[readExcel] Sheet "${sheetName}": ${paddedRows.length}行, ${maxCols}列, 首行: [${paddedRows[0]?.slice(0,5).join(', ')}]`);
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
