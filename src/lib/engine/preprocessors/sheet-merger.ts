import { RawDataGrid } from '@/types/rule';

// 合并多个Sheet的数据（只保留第一个Sheet的表头，跳过后续Sheet的表头行）
export function mergeSheets(data: RawDataGrid, headerRowIndex: number = 0): RawDataGrid {
  const sheetKeys = data.sheets ? Object.keys(data.sheets) : [];
  console.log(`[mergeSheets] 入口: sheets数量=${sheetKeys.length}, 顶层rows=${data.rows.length}, headerRowIndex=${headerRowIndex}`);
  for (const sn of sheetKeys) {
    const s = data.sheets![sn];
    console.log(`[mergeSheets]  Sheet "${sn}": ${s.rows.length}行, 首行: [${s.rows[0]?.slice(0,5).join(', ')}]`);
  }

  if (!data.sheets || sheetKeys.length <= 1) {
    console.log('[mergeSheets] 跳过合并（≤1个Sheet），直接返回原数据');
    return data;
  }

  const allRows: string[][] = [];
  const rowSheetMap: string[] = []; // 记录每行所属的Sheet名称
  const sheetNames = sheetKeys;
  let isFirstSheet = true;

  for (const sheetName of sheetNames) {
    const sheet = data.sheets[sheetName];
    let rowsToAdd: string[][];
    if (isFirstSheet) {
      // 第一个Sheet保留所有行（包含表头）
      rowsToAdd = sheet.rows;
      isFirstSheet = false;
    } else {
      // 后续Sheet跳过表头行
      rowsToAdd = sheet.rows.slice(headerRowIndex + 1);
    }
    allRows.push(...rowsToAdd);
    // 为添加的每一行记录所属Sheet
    for (let i = 0; i < rowsToAdd.length; i++) {
      rowSheetMap.push(sheetName);
    }
  }

  console.log(`[mergeSheets] 合并完成: 总计${allRows.length}行`);
  return {
    headers: data.headers,
    rows: allRows,
    rawText: allRows.map(r => r.join('\t')).join('\n'),
    metadata: {
      ...data.metadata,
      totalRows: allRows.length,
      rowSheetMap, // 关键：传递每行对应的Sheet名称
    },
    sheets: data.sheets,
  };
}
