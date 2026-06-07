// 规则引擎入口 - 统一解析流程
import { readExcelFile, readExcelBuffer } from './readers/excel';
import { readWordFile, readWordBuffer } from './readers/word';
import { readPdfFile, readPdfBuffer } from './readers/pdf';
import { skipRows, skipPatternRows } from './preprocessors/skip-rows';
import { detectCards, extractFromCard } from './preprocessors/card-splitter';
import { mergeSheets } from './preprocessors/sheet-merger';
import { splitOrders } from './preprocessors/order-splitter';
import { mapFields, extractFromTail } from './mappers/column-mapper';
import { aggregateRecords } from './transformers/aggregator';
import { transposeMatrix, transposeMatrixWithMapping } from './transformers/matrix-transposer';
import { splitCell } from './transformers/cell-splitter';
import { validateRecords } from './validators';
import { RawDataGrid, RuleConfig, FieldMapping } from '@/types/rule';
import { WaybillRecord, ValidationError } from '@/types/waybill';

export interface ParseResult {
  records: WaybillRecord[];
  validationErrors: ValidationError[];
  parseWarnings: string[];
  parseErrors: string[];
}

// 浏览器端：读取 File 对象
export async function readFile(file: File): Promise<RawDataGrid> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (['xlsx', 'xls'].includes(ext || '')) return readExcelFile(file);
  if (ext === 'docx') return readWordFile(file);
  if (ext === 'pdf') return readPdfFile(file);
  throw new Error(`不支持的文件格式: ${ext}`);
}

// 服务端：读取 ArrayBuffer
export async function readFileFromBuffer(buffer: ArrayBuffer, fileName: string): Promise<RawDataGrid> {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (['xlsx', 'xls'].includes(ext || '')) return readExcelBuffer(buffer, fileName);
  if (ext === 'docx') return readWordBuffer(buffer, fileName);
  if (ext === 'pdf') return readPdfBuffer(buffer, fileName);
  throw new Error(`不支持的文件格式: ${ext}`);
}

// 执行解析
export async function executeParse(file: File, ruleConfig: RuleConfig): Promise<ParseResult> {
  const warnings: string[] = [];
  const errors: string[] = [];

  // 1. 读取文件
  let rawData: RawDataGrid;
  try {
    rawData = await readFile(file);
  } catch (err: any) {
    return { records: [], validationErrors: [], parseWarnings: [], parseErrors: [err.message] };
  }

  // 2. 多Sheet合并
  if (ruleConfig.sheetMode === 'all') {
    const headerRowIdx = ruleConfig.headerRow - 1;
    rawData = mergeSheets(rawData, headerRowIdx);
  } else if (ruleConfig.sheetMode === 'multi' && ruleConfig.sheetNames) {
    // 按指定Sheet名合并
    const mergedRows: string[][] = [];
    for (const name of ruleConfig.sheetNames) {
      const sheet = rawData.sheets?.[name];
      if (sheet) mergedRows.push(...sheet.rows);
    }
    if (mergedRows.length > 0) {
      rawData = { ...rawData, rows: mergedRows, metadata: { ...rawData.metadata, totalRows: mergedRows.length } };
    }
  }

  // 3. 多订单拆分（PDF多单）
  if (ruleConfig.multiOrderSplit?.enabled) {
    const orders = splitOrders(rawData, ruleConfig.multiOrderSplit);
    // 每个订单独立处理
    let allRecords: WaybillRecord[] = [];
    for (const order of orders) {
      const orderData: RawDataGrid = { ...rawData, rows: order.rows, rawText: order.rows.map(r => r.join(' ')).join('\n') };
      const orderRecords = processSingleOrder(orderData, ruleConfig, warnings, errors);
      allRecords = allRecords.concat(orderRecords);
    }
    const validationErrors = validateRecords(allRecords);
    return { records: allRecords, validationErrors, parseWarnings: warnings, parseErrors: errors };
  }

  // 4. 单订单处理
  const records = processSingleOrder(rawData, ruleConfig, warnings, errors);
  const validationErrors = validateRecords(records);
  return { records, validationErrors, parseWarnings: warnings, parseErrors: errors };
}

function processSingleOrder(
  rawData: RawDataGrid,
  ruleConfig: RuleConfig,
  warnings: string[],
  errors: string[]
): WaybillRecord[] {
  let records: WaybillRecord[] = [];

  // 卡片式处理
  if (ruleConfig.cardDetection?.enabled) {
    const cards = detectCards(rawData, ruleConfig.cardDetection);
    let rowIndex = 0;
    for (const card of cards) {
      const cardFields = extractFromCard(card, ruleConfig.cardDetection);
      // 从卡片rows中找物品表
      const itemRows = card.rows.filter(r => r.length > 1);
      if (itemRows.length === 0) {
        warnings.push(`卡片"${card.title}"中未找到物品数据`);
        continue;
      }

      // 找物品表头
      let itemHeaderIndex = 0;
      for (let i = 0; i < itemRows.length; i++) {
        if (itemRows[i].some(c => /编码|名称|数量|规格/.test(c))) {
          itemHeaderIndex = i;
          break;
        }
      }
      const itemHeaders = itemRows[itemHeaderIndex];
      const itemDataRows = itemRows.slice(itemHeaderIndex + 1);

      for (const row of itemDataRows) {
        const mapped = mapFields(row, itemHeaders, ruleConfig.fieldMapping, card.rows.map(r => r.join(' ')).join('\n'), ruleConfig.defaultValues);
        records.push({
          externalCode: mapped.externalCode || cardFields.externalCode || '',
          recipientStore: mapped.recipientStore || cardFields.recipientStore || '',
          recipientName: mapped.recipientName || cardFields.recipientName || '',
          recipientPhone: mapped.recipientPhone || cardFields.recipientPhone || '',
          recipientAddress: mapped.recipientAddress || cardFields.recipientAddress || '',
          skuCode: mapped.skuCode || '',
          skuName: mapped.skuName || '',
          skuQuantity: parseInt(mapped.skuQuantity, 10) || 0,
          skuSpec: mapped.skuSpec || '',
          remark: mapped.remark || '',
          rowIndex: rowIndex++,
        });
      }
    }
    return records;
  }

  // 标准表格处理
  // 跳过行
  let processed = skipRows(rawData, ruleConfig.skipRows.top, ruleConfig.skipRows.bottom);
  processed = skipPatternRows(processed.data, ruleConfig.skipRowsPattern);

  const dataRows = processed.data.rows;
  if (dataRows.length === 0) {
    errors.push('没有可解析的数据行');
    return [];
  }

  // 确定表头和数据行（表头行号相对于跳过之后的数据行）
  const headerRowIndex = Math.max(0, ruleConfig.headerRow - 1 - ruleConfig.skipRows.top);
  const headers = headerRowIndex >= 0 && headerRowIndex < dataRows.length
    ? dataRows[headerRowIndex]
    : [];

  const globalStartRow = Math.max(ruleConfig.dataStartRow - 1, headerRowIndex + 1);
  const globalEndRow = ruleConfig.dataEndMode === 'fixed' && ruleConfig.dataEndRow
    ? ruleConfig.dataEndRow - 1
    : dataRows.length;

  // 数据列映射范围（可覆盖全局范围，但不能在表头之前）
  const dataStartRow = ruleConfig.dataColumnStartRow
    ? Math.max(ruleConfig.dataColumnStartRow - 1, headerRowIndex + 1)
    : globalStartRow;
  // 列映射阶段跳过底部行：缩减 dataEndRow
  let dataEndRow = globalEndRow;
  if (ruleConfig.columnSkipBottomRows && ruleConfig.columnSkipBottomRows > 0) {
    dataEndRow = Math.min(dataEndRow, dataRows.length - ruleConfig.columnSkipBottomRows);
    if (dataEndRow < dataStartRow) dataEndRow = dataStartRow; // 兜底保护
  }

  // 矩阵转置 + 字段映射：先转置门店，再用列映射填充SKU信息
  if (ruleConfig.matrixTransform?.enabled) {
    records = transposeMatrixWithMapping(
      { ...rawData, rows: dataRows },
      ruleConfig.matrixTransform,
      ruleConfig.fieldMapping,
      headerRowIndex
    );
  } else {
    // 标准行映射
    let rowIndex = 0;
    let skippedCount = 0;
    // tailText 包含全量数据行，确保表头之前的尾部信息也能被提取到
    const tailText = dataRows.map(r => r.join(' ')).join('\n');

    // 预先提取通用字段，避免每行重复计算
    const commonFields: (keyof FieldMapping)[] = [
      'externalCode', 'recipientStore', 'recipientName',
      'recipientPhone', 'recipientAddress', 'remark',
    ];
    const mergedDefaults: Record<string, string> = { ...ruleConfig.defaultValues };
    for (const field of commonFields) {
      const item = ruleConfig.fieldMapping[field];
      if (!item || mergedDefaults[field]) continue; // 已有默认值则跳过

      if (item.source === 'static' && item.value) {
        // 静态值直接采用
        mergedDefaults[field] = item.value;
      } else if (item.source === 'tailRegion' && item.matchPattern) {
        // 尾部提取执行一次
        const extracted = extractFromTail(tailText, item.matchPattern, field);
        if (extracted) mergedDefaults[field] = extracted;
      }
    }

    // 列映射跳过正则（匹配到的行不参与列映射）
    const colSkipRegex = ruleConfig.columnSkipPattern ? new RegExp(ruleConfig.columnSkipPattern, 'i') : null;

    for (let i = dataStartRow; i < dataEndRow && i < dataRows.length; i++) {
      const row = dataRows[i];
      if (row.every(c => !c)) continue; // 跳过空行

      // 列映射跳过检查
      if (colSkipRegex && colSkipRegex.test(row.join(' '))) {
        skippedCount++;
        continue;
      }

      const mapped = mapFields(row, headers, ruleConfig.fieldMapping, tailText, mergedDefaults);

      // 兜底保护：强制注入 static/tailRegion 配置值，确保通用字段永不丢失
      for (const field of commonFields) {
        const item = ruleConfig.fieldMapping[field];
        if (!item || mapped[field]) continue;
        if (item.source === 'static' && item.value) {
          mapped[field] = item.value;
        } else if (item.source === 'tailRegion' && item.matchPattern) {
          const v = extractFromTail(tailText, item.matchPattern, field);
          if (v) mapped[field] = v;
        }
      }

      // 如果所有SKU字段都为空，可能是非数据行
      if (!mapped.skuCode && !mapped.skuName && !mapped.skuQuantity) {
        skippedCount++;
        continue;
      }

      records.push({
        externalCode: mapped.externalCode || mergedDefaults.externalCode || '',
        recipientStore: mapped.recipientStore || mergedDefaults.recipientStore || '',
        recipientName: mapped.recipientName || mergedDefaults.recipientName || '',
        recipientPhone: mapped.recipientPhone || mergedDefaults.recipientPhone || '',
        recipientAddress: mapped.recipientAddress || mergedDefaults.recipientAddress || '',
        skuCode: mapped.skuCode || '',
        skuName: mapped.skuName || '',
        skuQuantity: parseInt(mapped.skuQuantity, 10) || 0,
        skuSpec: mapped.skuSpec || '',
        remark: mapped.remark || mergedDefaults.remark || '',
        rowIndex: rowIndex++,
      });
    }

    // 如果有数据行但全部被跳过，说明字段映射可能有问题
    if (records.length === 0 && dataRows.length > dataStartRow) {
      warnings.push('未提取到任何数据，请检查"字段映射"中SKU字段的列名是否与文件表头匹配');
    }
  }

  // 跨行聚合
  if (ruleConfig.aggregation.enabled) {
    records = aggregateRecords(records, ruleConfig.aggregation);
  }

  // 复合单元格拆分
  if (ruleConfig.cellSplitConfig?.enabled) {
    records = splitCell(records, ruleConfig.cellSplitConfig);
  }

  return records;
}
