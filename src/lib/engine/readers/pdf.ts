import { RawDataGrid } from '@/types/rule';
import { readExcelBuffer } from './excel';
import * as XLSX from 'xlsx';

const isNode = typeof window === 'undefined';

// ── 一维坐标聚类（基于组均值 + 最大扩散约束） ──
// 相比旧版（与组首值比较），均值比较防止聚类偏移；maxSpread约束防止链式合并
function cluster1D(values: number[], tolerance: number): number[] {
  if (values.length === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const clusters: number[] = [];
  let currentGroup = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const mean = currentGroup.reduce((a, b) => a + b, 0) / currentGroup.length;
    const dist = Math.abs(sorted[i] - mean);
    // 同时检查聚类扩散范围，防止链式合并（例如 100→120→140→160... 慢慢漂移）
    const groupMin = currentGroup[0];
    const groupMax = currentGroup[currentGroup.length - 1];
    const newSpread = Math.max(groupMax, sorted[i]) - Math.min(groupMin, sorted[i]);

    if (dist <= tolerance && newSpread <= tolerance * 2.5) {
      currentGroup.push(sorted[i]);
    } else {
      clusters.push(currentGroup.reduce((a, b) => a + b, 0) / currentGroup.length);
      currentGroup = [sorted[i]];
    }
  }
  clusters.push(currentGroup.reduce((a, b) => a + b, 0) / currentGroup.length);
  return clusters;
}

// ── 计算区间边界（相邻中心的中点），用于确定性列/行分配 ──
// 返回区间数组：[{min, max, center}]，min/max 是此列的行/列范围
function computeBoundaries(centers: number[]): { min: number; max: number; center: number }[] {
  if (centers.length === 0) return [];
  if (centers.length === 1) {
    return [{ min: -Infinity, max: Infinity, center: centers[0] }];
  }
  const bounds: { min: number; max: number; center: number }[] = [];
  for (let i = 0; i < centers.length; i++) {
    const left = i === 0 ? -Infinity : (centers[i - 1] + centers[i]) / 2;
    const right = i === centers.length - 1 ? Infinity : (centers[i] + centers[i + 1]) / 2;
    bounds.push({ min: left, max: right, center: centers[i] });
  }
  return bounds;
}

// ── pdf.js 提取表格（坐标聚类 → 二维数组） ──
// globalColCenters: 可选，从所有页面统一计算的列中心，用于跨页列对齐
function pdfToRows(items: any[], globalColCenters?: number[]): string[][] {
  const valid = items.filter((item: any) => item.str.trim().length > 0);
  if (valid.length === 0) return [];

  const heights = valid.map((item: any) => item.height).filter((h: number) => h > 0);
  const sortedH = [...heights].sort((a, b) => a - b);
  const medianH = sortedH.length > 0 ? sortedH[Math.floor(sortedH.length / 2)] : 10;
  const yTol = Math.max(3, medianH * 0.5);
  const xTol = Math.max(8, medianH * 1.2);

  const yValues = valid.map((item: any) => item.transform[5]);
  // 第一阶段：宽松聚类获取行中心（Y 坐标从上到下递减）
  const rowCentersPrelim = cluster1D(yValues, medianH * 0.8).sort((a, b) => b - a);

  // 第二阶段：合并过近的行中心（同一行文字Y坐标有微小波动时防止误拆）
  const rowCenters: number[] = [];
  for (let i = 0; i < rowCentersPrelim.length; i++) {
    if (rowCenters.length === 0) {
      rowCenters.push(rowCentersPrelim[i]);
    } else {
      const prev = rowCenters[rowCenters.length - 1];
      // 两个行中心间距小于 0.3*medianH → 合并（取均值）
      if (Math.abs(rowCentersPrelim[i] - prev) < medianH * 0.3) {
        rowCenters[rowCenters.length - 1] = (rowCentersPrelim[i] + prev) / 2;
      } else {
        rowCenters.push(rowCentersPrelim[i]);
      }
    }
  }

  // 升序排列用于边界计算
  const rowCentersAsc = [...rowCenters].sort((a, b) => a - b);

  // X 聚类：优先使用全局列中心，确保跨页列数一致
  const colCenters = globalColCenters
    ? globalColCenters
    : cluster1D(valid.map((item: any) => item.transform[4]), xTol).sort((a, b) => a - b);

  // ── 使用边界分割（非"最近中心"），消除歧义 ──
  // 边界计算必须基于升序排列
  const rowBounds = computeBoundaries(rowCentersAsc);
  const colBounds = computeBoundaries(colCenters);

  // 构建查找：坐标 → (行索引, 列索引)
  // rowIdx 基于升序（0=页面底部），构建表格后 reverse()
  function findRowIdx(y: number): number {
    for (let i = 0; i < rowBounds.length; i++) {
      if (y >= rowBounds[i].min && y < rowBounds[i].max) return i;
    }
    // 兜底：如果落在边界外，用最近中心（基于升序）
    let bestI = 0, bestD = Infinity;
    for (let i = 0; i < rowCentersAsc.length; i++) {
      const d = Math.abs(y - rowCentersAsc[i]);
      if (d < bestD) { bestD = d; bestI = i; }
    }
    return bestI;
  }

  function findColIdx(x: number): number {
    for (let i = 0; i < colBounds.length; i++) {
      if (x >= colBounds[i].min && x < colBounds[i].max) return i;
    }
    let bestI = 0, bestD = Infinity;
    for (let i = 0; i < colCenters.length; i++) {
      const d = Math.abs(x - colCenters[i]);
      if (d < bestD) { bestD = d; bestI = i; }
    }
    return bestI;
  }

  const grid = new Map<string, string[]>();
  for (const item of valid) {
    const x = item.transform[4], y = item.transform[5];
    const rowIdx = findRowIdx(y);    // 基于升序 rowCentersAsc
    const colIdx = findColIdx(x);

    // 检查是否超出合理范围（距离基于升序中心）
    const rowDist = Math.abs(y - rowCentersAsc[rowIdx]);
    const colDist = Math.abs(x - colCenters[colIdx]);
    if (rowDist > yTol * 3 || colDist > xTol * 3) continue;

    const key = `${rowIdx},${colIdx}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key)!.push(item.str);
  }

  // 按升序构建表格（rowIdx 0 = 页面底部），然后 reverse() 使顶部行在前
  const tableAsc: string[][] = [];
  for (let r = 0; r < rowCentersAsc.length; r++) {
    const row: string[] = [];
    for (let c = 0; c < colCenters.length; c++) {
      const texts = grid.get(`${r},${c}`);
      row.push(texts ? joinCellTexts(texts) : '');
    }
    if (row.some(cell => cell !== '')) tableAsc.push(row);
  }
  const table = tableAsc.reverse();

  // ── 合并间距过近的相邻列 ──
  // PDF 渲染时常把同一列的文字拆到多个窄列（例如 "物品编码" → ["物","品","编","码"] 分到相邻 4 列）
  // 如果相邻列的间距小于 xTol，说明它们很可能是被误拆的同一逻辑列，合并之
  function mergeCloseColumns(
    inputTable: string[][],
    centers: number[],
    tolerance: number,
  ): string[][] {
    if (inputTable.length === 0) return inputTable;
    const nCols = inputTable[0].length;
    if (nCols <= 1) return inputTable;

    const groups: number[][] = [[0]];
    for (let c = 1; c < nCols; c++) {
      const prevCol = groups[groups.length - 1];
      const lastCol = prevCol[prevCol.length - 1];
      const gap = centers[c] - centers[lastCol];

      if (gap <= tolerance) {
        // 列间距很小 → 可能是被拆分，合并
        prevCol.push(c);
      } else {
        groups.push([c]);
      }
    }
    return inputTable.map(row =>
      groups.map(group => group.map(c => row[c]).join('').trim())
    );
  }

  // ── 合并被误拆的相邻行 ──
  // PDF 中同一逻辑行的文字可能因 Y 坐标微小波动被分到两行（如 "合" "计" 分开）
  // 若相邻行每列内容均可无损拼接，则合并为一行
  function mergeCloseRows(inputTable: string[][]): string[][] {
    if (inputTable.length <= 1) return inputTable;
    const merged: string[][] = [inputTable[0]];
    for (let r = 1; r < inputTable.length; r++) {
      const prev = merged[merged.length - 1];
      const curr = inputTable[r];
      const maxCols = Math.max(prev.length, curr.length);

      // 内容充实度：如果两行都是完整行（≥3 非空列），不合并
      const prevFilled = prev.filter(c => (c ?? '').trim() !== '').length;
      const currFilled = curr.filter(c => (c ?? '').trim() !== '').length;
      if (prevFilled >= 3 && currFilled >= 3) {
        merged.push(curr);
        continue;
      }
      // 保护完整行：如果 prev 是完整行，且 curr 在任一列与 prev 重叠 → 不合并
      if (prevFilled >= 3) {
        let overlap = false;
        for (let c = 0; c < Math.min(prev.length, curr.length); c++) {
          if ((prev[c] ?? '').trim() !== '' && (curr[c] ?? '').trim() !== '') {
            overlap = true; break;
          }
        }
        if (overlap) { merged.push(curr); continue; }
      }

      let canMerge = true;
      for (let c = 0; c < maxCols; c++) {
        const pc = (prev[c] ?? '').trim();
        const cc = (curr[c] ?? '').trim();
        if (pc !== '' && cc !== '') {
          // 两行同一列都有内容 → 只有短内容（≤3字）才拼接（可能是 CJK 被拆）
          if (pc.length <= 3 && cc.length <= 3) continue;
          canMerge = false; break;
        }
      }
      if (canMerge) {
        const newRow = [...prev];
        for (let c = 0; c < maxCols; c++) {
          newRow[c] = (newRow[c] ?? '') + (curr[c] ?? '');
        }
        merged[merged.length - 1] = newRow;
      } else {
        merged.push(curr);
      }
    }
    return merged;
  }

  // ── 过滤页脚行 ──
  function isFooterRow(row: string[]): boolean {
    const text = row.join(' ');
    // "第X页 / 共X页" 或 "第 X 页 共 X 页"
    return /第\s*\d+\s*页\s*\/?\s*共\s*\d+\s*页/.test(text);
  }

  // 过滤页脚行（不合并行，保持原始换行结构）
  let processed = table.filter(r => !isFooterRow(r));
  // 合并列间距在 2.2*xTol 以内的窄列（合并拆分字符和跨页空列）
  processed = mergeCloseColumns(processed, colCenters, xTol * 2.2);
  // 列合并后做保守行合并（只合互斥碎片行，如"合"+"计"拆分）
  processed = mergeCloseRows(processed);

  // 不在此处过滤空列！由调用方在全局拼接后统一处理
  return processed;
}

// ── 智能拼接同一单元格内的文字项 ──
// PDF 渲染时中文字符经常被拆成单个字，如 "数量" → ["数", "量"]
// 如果直接 join(' ') 会得到 "数 量"，导致后续列名匹配失败
function joinCellTexts(texts: string[]): string {
  if (texts.length === 0) return '';
  if (texts.length === 1) return texts[0].trim();

  // 检测是否全部为单字 CJK 字符（中文/日文/韩文）
  const allSingleCJK = texts.every(t => {
    const s = t.trim();
    // 单个 CJK 字符，或带标点符号的 CJK
    return /^[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]$/.test(s);
  });

  if (allSingleCJK) {
    // CJK 文字直接拼接，不加空格
    return texts.join('').trim();
  }

  // 非 CJK 文字保留空格分隔
  return texts.join(' ').replace(/\s+/g, ' ').trim();
}

// ── 全局稀疏列移除 ──
// 标题行可能产生独立列中心（如居中的长文字），导致数据行中出现全空列
// 在所有页拼接后统一移除，保证列结构一致
function removeSparseColumns(
  inputTable: string[][],
  headerRows: number = 8,
  threshold: number = 0.05,
): string[][] {
  if (inputTable.length <= headerRows) return inputTable;
  const dataRows = inputTable.slice(headerRows);
  const keep: boolean[] = inputTable[0].map((_, c) => {
    let filled = 0;
    for (const row of dataRows) {
      if ((row[c] ?? '').trim() !== '') filled++;
    }
    return filled >= Math.ceil(dataRows.length * threshold);
  });
  // 至少保留 1 列
  if (keep.every(v => !v)) keep[0] = true;
  return inputTable.map(row => row.filter((_, c) => keep[c]));
}

// ── 通过 Python openpyxl 生成 Excel buffer ──
// 将表格数据通过 stdin 传给 Python 脚本，从 stdout 读取 base64 编码的 .xlsx
// 失败时降级到 XLSX 库
async function generateExcelViaOpenpyxl(rows: string[][]): Promise<ArrayBuffer | null> {
  // 仅 Node.js 环境执行，浏览器端直接降级到 XLSX
  if (!isNode) return null;

  let path: any, fs: any;
  try { path = await import('path'); fs = await import('fs'); } catch { return null; }

  // 查找 excel_builder.py（处理 ESM/CJS/编译后路径差异）
  let scriptPath: string;
  try {
    const { fileURLToPath } = await import('url');
    const __dirname = path.dirname(fileURLToPath((import.meta as any).url));
    scriptPath = path.resolve(__dirname, '..', '..', '..', '..', 'excel_builder.py');
  } catch {
    scriptPath = path.resolve(process.cwd(), 'excel_builder.py');
  }
  console.log(`[PDF] openpyxl script: ${scriptPath}`);

  try {
    const { execFileSync } = await import('child_process');
    const jsonInput = JSON.stringify({ rows });
    const base64Output = execFileSync('python', [scriptPath], {
      input: jsonInput,
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024,
      timeout: 30000,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });

    const buffer = Buffer.from(base64Output.trim(), 'base64');
    console.log(`[PDF] openpyxl generated ${(buffer.length / 1024).toFixed(1)}KB xlsx`);

    const result = new ArrayBuffer(buffer.length);
    new Uint8Array(result).set(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.length));
    return result as ArrayBuffer;
  } catch (err) {
    console.warn('[PDF] openpyxl failed, falling back to XLSX:', (err as Error).message);
    return null;
  }
}

// ── PDF → Excel Buffer → readExcelBuffer（复用 Excel 解析链路） ──
async function pdfToExcelGrid(pdfjs: any, typedArray: Uint8Array, fileName: string): Promise<RawDataGrid> {
  const pdf = await pdfjs.getDocument({ data: typedArray }).promise;

  // ── 第一步：预先提取所有页面文本项，用于全局 X 聚类 ──
  const allPageItems: any[][] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    allPageItems.push(content.items);
  }

  // ── 全局 X 聚类：所有页面的文本项统一计算列中心，确保跨页列数一致 ──
  const allValid = allPageItems.flat().filter((item: any) => item.str.trim().length > 0);
  const allHeights = allValid.map((item: any) => item.height).filter((h: number) => h > 0);
  const allSortedH = [...allHeights].sort((a, b) => a - b);
  const globalMedianH = allSortedH.length > 0 ? allSortedH[Math.floor(allSortedH.length / 2)] : 10;
  const globalXTol = Math.max(8, globalMedianH * 1.2);
  const allXValues = allValid.map((item: any) => item.transform[4]);
  const globalColCenters = cluster1D(allXValues, globalXTol).sort((a, b) => a - b);
  console.log(`[PDF] 全局X聚类: ${globalColCenters.length}列 (中位字号=${globalMedianH.toFixed(1)}pt, xTol=${globalXTol.toFixed(1)})`);

  // ── 第二步：逐页提取（使用全局列中心，保证跨页列数一致） ──
  const allRows: string[][] = [];
  for (let i = 0; i < allPageItems.length; i++) {
    const pageRows = pdfToRows(allPageItems[i], globalColCenters);
    console.log(`[PDF] 第${i + 1}页提取到 ${pageRows.length} 行, 每行列数: ${pageRows.map(r => r.length).join(',')}`);
    allRows.push(...pageRows);
  }

  // 日志：输出前 10 行原始数据
  console.log(`[PDF] 总共提取 ${allRows.length} 行，前10行预览:`);
  for (let i = 0; i < Math.min(10, allRows.length); i++) {
    console.log(`[PDF]  行${i}: [${allRows[i].map(c => `"${c}"`).join(', ')}]`);
  }

  // ── 去重跨页表头 ──
  // 多页 PDF 每页可能有相同的表头，保留首次出现，后续全部跳过
  const headerKeywords = ['物品编码', '物品名称', '规格', '数量', '单位', '备注'];
  function isTableHeaderRow(row: string[]): boolean {
    const text = row.join('');
    return headerKeywords.filter(k => text.includes(k)).length >= 2;
  }
  const dedupedRows: string[][] = [];
  let headerFound = false;
  let headerRowColCount = 0;
  for (let i = 0; i < allRows.length; i++) {
    const row = allRows[i];
    if (isTableHeaderRow(row)) {
      if (!headerFound) {
        headerFound = true;
        headerRowColCount = row.length;  // 用表头行的总列数（含空列）作为标准
        dedupedRows.push(row);
        continue;
      }
      // 后续所有表头行都跳过
      continue;
    }
    dedupedRows.push(row);
  }
  if (dedupedRows.length < allRows.length) {
    console.log(`[PDF] 去重表头: ${allRows.length}行 → ${dedupedRows.length}行 (标准列数=${headerRowColCount})`);
  }

  // ── 跨页列对齐与规范化 ──
  // 不同页可能产生不同列数。以表头行的有效列数为标准，统一规范化所有行
  const stdCols = headerRowColCount > 0 ? headerRowColCount : Math.max(...dedupedRows.map(r => r.length));
  const alignedRows = dedupedRows.map(row => {
    const nonEmpty = row.filter(c => c.trim() !== '').length;
    // 有效列数与标准一致的行直接保留，列数不同的行进行填充或合并
    if (row.length === stdCols) return [...row];
    if (row.length < stdCols) {
      const padded = [...row];
      while (padded.length < stdCols) padded.push('');
      return padded;
    }
    // 行列数 > 标准列数：合并末尾多余列（只合并全空的列）
    const trimmed = row.slice(0, stdCols);
    const tail = row.slice(stdCols).join('').trim();
    if (tail) trimmed[stdCols - 1] = (trimmed[stdCols - 1] + ' ' + tail).trim();
    return trimmed;
  });

  // ── 全局空列移除（所有页拼接后统一处理，保证列位置一致） ──
  const nonEmptyCols: number[] = [];
  for (let c = 0; c < stdCols; c++) {
    if (alignedRows.some(row => row[c] !== '')) nonEmptyCols.push(c);
  }
  const cleanedRows = alignedRows.map(row => nonEmptyCols.map(c => row[c]));
  console.log(`[PDF] 全局空列移除: ${stdCols}列 → ${nonEmptyCols.length}列`);


  // ── 生成 Excel buffer：优先 openpyxl，降级 XLSX ──
  // 注：不调用 removeSparseColumns，其 headerRows=8 参数会将表格表头（行6）
  // 归入标题区，导致"备注"等表头在数据行为空的列被误删除。
  // 全局空列移除（上一步）已处理真正全空的列。
  let xlsxBuffer: ArrayBuffer;
  const pyBuffer = await generateExcelViaOpenpyxl(cleanedRows);
  if (pyBuffer) {
    xlsxBuffer = pyBuffer;
  } else {
    // 降级：使用 XLSX 库
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(cleanedRows);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as ArrayBuffer;
  }

  // 复用 Excel reader 解析，确保与 Excel 文件完全一致的输出格式
  const result = readExcelBuffer(xlsxBuffer, fileName);

  // ── 修正 headers：用真实表格表头行替换标题行 ──
  // readExcelBuffer 返回 headers = 第一行（标题行，大多为空），
  // 业务层字段映射需要真实的表头行才能正确识别所有列（含"备注"）
  let fixed = false;
  for (let r = 0; r < result.rows.length; r++) {
    const row = result.rows[r];
    const text = row.join('');
    // 用两种方式检测表头行：关键词匹配 或 "物品编码/备注" 同时存在
    const kwCount = headerKeywords.filter(k => text.includes(k)).length;
    const hasAll = row.some(c => c === '物品编码') && row.some(c => c === '备注');
    if (kwCount >= 2 || hasAll) {
      result.headers = row;
      console.log(`[PDF] headers: 替换为第${r}行 (${row.length}列) → [${row.filter(c => c).join(', ')}]`);
      fixed = true;
      break;
    }
  }
  if (!fixed) {
    console.log(`[PDF] headers: 未找到表头行，保留原始headers (${result.headers.length}列)`);
  }
  console.log(`[PDF] readExcelBuffer: ${result.rows.length}行, ${result.rows[0]?.length || 0}列`);

  return result;
}

// 服务端版本
export async function readPdfBuffer(buffer: ArrayBuffer, fileName: string): Promise<RawDataGrid> {
  if (isNode) {
    if (!(globalThis as any).DOMMatrix) {
      (globalThis as any).DOMMatrix = class { a = 1; b = 0; c = 0; d = 1; e = 0; f = 0; };
    }
    const pdfjs = await import('pdfjs-dist');
    const path = await import('path');
    const { pathToFileURL } = await import('url');
    const workerPath = path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
    return pdfToExcelGrid(pdfjs, new Uint8Array(buffer), fileName);
  }
  // 浏览器端：同源加载 worker（已复制到 public/）
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  return pdfToExcelGrid(pdfjs, new Uint8Array(buffer), fileName);
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
