import mammoth from 'mammoth';
import { RawDataGrid } from '@/types/rule';

// 服务端版本：接收 ArrayBuffer
export async function readWordBuffer(buffer: ArrayBuffer, fileName: string): Promise<RawDataGrid> {
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  const rawText = result.value;
  const lines = rawText.split('\n').filter(line => line.trim() !== '');
  const rows: string[][] = lines.map(line => [line]);

  return {
    headers: ['content'],
    rows,
    rawText,
    metadata: {
      fileName,
      fileType: 'word',
      sheetCount: 1,
      totalRows: rows.length,
      totalCols: 1,
    },
  };
}

// 浏览器版本
export async function readWordFile(file: File): Promise<RawDataGrid> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const result = await readWordBuffer(e.target?.result as ArrayBuffer, file.name);
        resolve(result);
      } catch (err) {
        reject(new Error(`Word文件解析失败: ${err instanceof Error ? err.message : '未知错误'}`));
      }
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsArrayBuffer(file);
  });
}
