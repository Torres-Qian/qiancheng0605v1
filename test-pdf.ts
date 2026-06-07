/**
 * PDF → 表格转换自测脚本
 * 运行: npx tsx test-pdf.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
// @ts-ignore
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

// ── 一维坐标聚类（基于组均值 + 最大扩散约束） ──
function cluster1D(values: number[], tolerance: number): number[] {
  if (values.length === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const clusters: number[] = [];
  let currentGroup = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const mean = currentGroup.reduce((a, b) => a + b, 0) / currentGroup.length;
    const dist = Math.abs(sorted[i] - mean);
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

// ── 边界分割 ──
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

// ── CJK 智能拼接 ──
function joinCellTexts(texts: string[]): string {
  if (texts.length === 0) return '';
  if (texts.length === 1) return texts[0].trim();

  const allSingleCJK = texts.every(t => {
    const s = t.trim();
    return /^[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]$/.test(s);
  });

  if (allSingleCJK) {
    return texts.join('').trim();
  }
  return texts.join(' ').replace(/\s+/g, ' ').trim();
}

// ── 核心：PDF 文本项 → 表格二维数组 ──
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
  // 第一阶段：宽松聚类获取行中心
  const rowCentersPrelim = cluster1D(yValues, medianH * 0.8).sort((a, b) => b - a);

  // 第二阶段：合并过近的行中心
  const rowCenters: number[] = [];
  for (let i = 0; i < rowCentersPrelim.length; i++) {
    if (rowCenters.length === 0) {
      rowCenters.push(rowCentersPrelim[i]);
    } else {
      const prev = rowCenters[rowCenters.length - 1];
      if (Math.abs(rowCentersPrelim[i] - prev) < medianH * 0.3) {
        rowCenters[rowCenters.length - 1] = (rowCentersPrelim[i] + prev) / 2;
      } else {
        rowCenters.push(rowCentersPrelim[i]);
      }
    }
  }

  const rowCentersAsc = [...rowCenters].sort((a, b) => a - b);

  // X 聚类：优先使用全局列中心，确保跨页列数一致
  const colCenters = globalColCenters
    ? globalColCenters
    : cluster1D(valid.map((item: any) => item.transform[4]), xTol).sort((a, b) => a - b);

  console.log(`  📐 中位字号高度: ${medianH.toFixed(1)}pt`);
  console.log(`  📐 Y 聚类容差: ${yTol.toFixed(1)}, X 聚类容差: ${xTol.toFixed(1)}`);
  console.log(`  📐 行聚类中心数: ${rowCenters.length}, 列聚类中心数: ${colCenters.length}${globalColCenters ? ' (全局)' : ''}`);
  console.log(`  📐 列中心坐标: [${colCenters.map(c => c.toFixed(1)).join(', ')}]`);

  // 边界计算必须基于升序排列
  const rowBounds = computeBoundaries(rowCentersAsc);
  const colBounds = computeBoundaries(colCenters);

  // 输出列边界
  console.log(`  📐 列边界: [${colBounds.map(b => `[${b.min === -Infinity ? '-' : b.min.toFixed(1)}, ${b.max === Infinity ? '+' : b.max.toFixed(1)}]`).join(', ')}]`);

  function findIdx(v: number, centers: number[], bounds: { min: number; max: number; center: number }[]): number {
    for (let i = 0; i < bounds.length; i++) {
      if (v >= bounds[i].min && v < bounds[i].max) return i;
    }
    let bestI = 0, bestD = Infinity;
    for (let i = 0; i < centers.length; i++) {
      const d = Math.abs(v - centers[i]);
      if (d < bestD) { bestD = d; bestI = i; }
    }
    return bestI;
  }

  const grid = new Map<string, string[]>();
  for (const item of valid) {
    const x = item.transform[4], y = item.transform[5];
    // 使用升序标定 → rowIdx 从 0（底部）到 N-1（顶部）
    const rowIdx = findIdx(y, rowCentersAsc, rowBounds);
    const colIdx = findIdx(x, colCenters, colBounds);

    const rowDist = Math.abs(y - rowCentersAsc[rowIdx]);
    const colDist = Math.abs(x - colCenters[colIdx]);
    if (rowDist > yTol * 3 || colDist > xTol * 3) continue;

    const key = `${rowIdx},${colIdx}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key)!.push(item.str);
  }

  // 按升序构建（rowIdx 0 = 页面底部），然后 reverse 使顶部行在前
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

  // ── 合并被误拆的相邻行 ──
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
    console.log(`  🔗 行合并: ${inputTable.length}行 → ${merged.length}行`);
    return merged;
  }

  // ── 过滤页脚行 ──
  function isFooterRow(row: string[]): boolean {
    const text = row.join(' ');
    return /第\s*\d+\s*页\s*\/?\s*共\s*\d+\s*页/.test(text);
  }

  // 过滤页脚（不合并行，保持原始换行结构）
  const tableWithoutFooter = table.filter(r => !isFooterRow(r));
  if (tableWithoutFooter.length < table.length) {
    console.log(`  🗑️ 过滤页脚: ${table.length - tableWithoutFooter.length}行`);
  }

  // ── 合并间距过近的相邻列 ──
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
        prevCol.push(c);
      } else {
        groups.push([c]);
      }
    }
    const merged = inputTable.map(row =>
      groups.map(group => group.map(c => row[c]).join('').trim())
    );
    console.log(`  🔗 列合并: ${nCols}列 → ${merged[0]?.length || 0}列 (间距容差=${tolerance.toFixed(1)}, 组=[${groups.map(g => `[${g.join(',')}]`).join(' ')}])`);
    return merged;
  }

  // 合并列间距在 2.2*xTol 以内的窄列（合并拆分字符和跨页空列）
  let merged = mergeCloseColumns(tableWithoutFooter, colCenters, xTol * 2.2);
  // 列合并后做保守行合并（只合互斥碎片行，如"合"+"计"拆分）
  merged = mergeCloseRows(merged);

  // 不在此处过滤空列！由调用方在全局拼接后统一处理
  return merged;
}

// ── 主流程 ──
async function main() {
  const pdfPath = path.resolve(__dirname, '..', 'demos', '黔寨寨贵州烙锅（鞍山店）常温.pdf');
  console.log(`\n📄 读取 PDF: ${pdfPath}\n`);
  
  if (!fs.existsSync(pdfPath)) {
    console.error(`❌ 文件不存在: ${pdfPath}`);
    process.exit(1);
  }

  // 设置 worker (Windows 上需要 file:// URL)
  const { pathToFileURL } = await import('url');
  const workerPath = path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;

  const buffer = fs.readFileSync(pdfPath);
  const typedArray = new Uint8Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));

  const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;
  console.log(`📊 PDF 共 ${pdf.numPages} 页\n`);

  // ── 第一步：预先提取所有页面文本项，用于全局 X 聚类 ──
  const allPageItems: any[][] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    allPageItems.push(content.items);
    console.log(`📑 第 ${i} 页: ${content.items.length} 个文本项`);
  }

  // ── 全局 X 聚类：所有页面的文本项统一计算列中心，确保跨页列数一致 ──
  const allValid = allPageItems.flat().filter((item: any) => item.str.trim().length > 0);
  const allHeights = allValid.map((item: any) => item.height).filter((h: number) => h > 0);
  const allSortedH = [...allHeights].sort((a, b) => a - b);
  const globalMedianH = allSortedH.length > 0 ? allSortedH[Math.floor(allSortedH.length / 2)] : 10;
  const globalXTol = Math.max(8, globalMedianH * 1.2);
  const allXValues = allValid.map((item: any) => item.transform[4]);
  const globalColCenters = cluster1D(allXValues, globalXTol).sort((a, b) => a - b);
  console.log(`\n🌐 全局X聚类: ${globalColCenters.length}列 (中位字号=${globalMedianH.toFixed(1)}pt, xTol=${globalXTol.toFixed(1)})`);
  console.log(`🌐 全局列中心: [${globalColCenters.map(c => c.toFixed(1)).join(', ')}]\n`);

  const allRows: string[][] = [];

  for (let i = 0; i < allPageItems.length; i++) {
    console.log(`📑 第 ${i + 1} 页:`);
    const pageRows = pdfToRows(allPageItems[i], globalColCenters);
    console.log(`   提取到 ${pageRows.length} 行, 每行 ${pageRows[0]?.length || 0} 列\n`);
    allRows.push(...pageRows);
  }

  // ── 去重跨页表头 ──
  const headerKeywords = ['物品编码', '物品名称', '规格', '数量', '单位', '备注'];
  function isTableHeaderRow(row: string[]): boolean {
    const text = row.join('');
    return headerKeywords.filter(k => text.includes(k)).length >= 2;
  }
  const deduped: string[][] = [];
  let headerFound = false;
  let headerRowColCount = 0;
  for (let i = 0; i < allRows.length; i++) {
    const row = allRows[i];
    if (isTableHeaderRow(row)) {
      if (!headerFound) {
        headerFound = true;
        headerRowColCount = row.length;  // 用表头行的总列数（含空列）作为标准
        deduped.push(row);
        continue;
      }
      continue;
    }
    deduped.push(row);
  }
  if (deduped.length < allRows.length) {
    console.log(`\n🔁 去重表头: ${allRows.length}行 → ${deduped.length}行\n`);
  }

  // ── 跨页列对齐与规范化 ──
  const stdCols = headerRowColCount > 0 ? headerRowColCount : Math.max(...deduped.map(r => r.length));
  const alignedRows = deduped.map(row => {
    if (row.length === stdCols) return [...row];
    if (row.length < stdCols) {
      const padded = [...row];
      while (padded.length < stdCols) padded.push('');
      return padded;
    }
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

  const finalRows = cleanedRows.filter((_, r) => {
    return cleanedRows[r].some(c => c !== '');
  });
  const finalCols = nonEmptyCols.length;
  console.log(`  📐 跨页对齐: ${stdCols}列 → ${finalCols}列（移除${stdCols - finalCols}全空列），${finalRows.length}行\n`);

  // ── 输出表格 ──
  console.log('═══════════════════════════════════════════════════');
  console.log(`📋 转换结果: 共 ${finalRows.length} 行`);
  console.log('═══════════════════════════════════════════════════\n');

  // 计算每列最大宽度
  const colWidths: number[] = [];
  for (const row of finalRows) {
    for (let c = 0; c < row.length; c++) {
      const len = [...row[c]].length; // CJK 字符宽度
      colWidths[c] = Math.max(colWidths[c] || 0, len);
    }
  }

  // 打印表格
  for (let r = 0; r < finalRows.length; r++) {
    const row = finalRows[r];
    const cells = row.map((cell, c) => {
      const w = colWidths[c] || 5;
      return cell.padEnd(w + 2); // 额外 padding
    });
    const prefix = r === 0 ? '🔹' : '  ';
    console.log(`${prefix} [${r}] | ${cells.join('| ')}|`);
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log('✅ 自测完成');
  console.log('═══════════════════════════════════════════════════\n');

  // ── 导出 JSON（供 Python openpyxl 使用） ──
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const jsonPath = path.resolve(__dirname, '..', `pdf-data-${ts}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify({ rows: finalRows, timestamp: ts }, null, 2), 'utf-8');
  console.log(`📁 JSON 已保存: ${jsonPath}`);

  // ── 导出 Excel ──
  const xlsxPath = path.resolve(__dirname, `pdf-output-${ts}.xlsx`);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(finalRows);
  XLSX.utils.book_append_sheet(wb, ws, 'PDF导出');
  XLSX.writeFile(wb, xlsxPath);
  console.log(`📁 Excel 已保存: ${xlsxPath}\n`);

  // ── 关键诊断 ──
  console.log('🔍 关键诊断:');
  if (finalRows.length > 0) {
    const firstRow = finalRows[0];
    console.log(`  表头行: [${firstRow.map(c => `"${c}"`).join(', ')}]`);
    
    // 检查是否有典型的列名被拆分
    const expectedHeaders = ['物品编码', '物品名称', '数量', '规格', '单位'];
    for (const eh of expectedHeaders) {
      const found = firstRow.findIndex(c => c.includes(eh) || c.replace(/\s/g, '').includes(eh));
      console.log(`  "${eh}" ${found >= 0 ? `✅ 在第${found}列找到 "${firstRow[found]}"` : '❌ 未找到'}`);
    }

    // 检查数据行
    if (finalRows.length > 1) {
      console.log(`\n  数据行数: ${finalRows.length - 1}`);
      for (let r = 1; r < Math.min(6, finalRows.length); r++) {
        console.log(`  数据行${r}: [${finalRows[r].map(c => `"${c}"`).join(', ')}]`);
      }
    }
  }
}

main().catch(err => {
  console.error('❌ 测试失败:', err);
  process.exit(1);
});
