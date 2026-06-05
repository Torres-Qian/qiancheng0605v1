import { RawDataGrid } from '@/types/rule';

let pdfjsLib: typeof import('pdfjs-dist') | null = null;

async function getPdfjs() {
  if (!pdfjsLib) {
    pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
  }
  return pdfjsLib;
}

// 服务端版本：接收 ArrayBuffer
export async function readPdfBuffer(buffer: ArrayBuffer, fileName: string): Promise<RawDataGrid> {
  const pdfjs = await getPdfjs();
  const typedArray = new Uint8Array(buffer);
  const pdf = await pdfjs.getDocument({ data: typedArray }).promise;
  const allText: string[] = [];
  const allRows: string[][] = [];
  const pages: Record<string, RawDataGrid> = {};

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    const lineMap = new Map<number, string[]>();
    content.items.forEach((item: any) => {
      const y = Math.round(item.transform[5]);
      if (!lineMap.has(y)) lineMap.set(y, []);
      lineMap.get(y)!.push(item.str);
    });

    const sortedLines = [...lineMap.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, words]) => words.join(' ').trim())
      .filter(line => line.length > 0);

    allText.push(...sortedLines);
    const pageRows = sortedLines.map(line => [line]);
    allRows.push(...pageRows);

    pages[`page_${i}`] = {
      headers: ['content'],
      rows: pageRows,
      rawText: sortedLines.join('\n'),
      metadata: {
        fileName,
        fileType: 'pdf',
        sheetCount: 1,
        totalRows: pageRows.length,
        totalCols: 1,
      },
    };
  }

  return {
    headers: ['content'],
    rows: allRows,
    rawText: allText.join('\n'),
    metadata: {
      fileName,
      fileType: 'pdf',
      sheetCount: pdf.numPages,
      totalRows: allRows.length,
      totalCols: 1,
    },
    sheets: pages,
  };
}

// 浏览器版本
export async function readPdfFile(file: File): Promise<RawDataGrid> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const result = await readPdfBuffer(e.target?.result as ArrayBuffer, file.name);
        resolve(result);
      } catch (err) {
        reject(new Error(`PDF文件解析失败: ${err instanceof Error ? err.message : '未知错误'}`));
      }
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsArrayBuffer(file);
  });
}
