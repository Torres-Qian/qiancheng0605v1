// 规则引擎入口 - 统一解析流程
import { readExcelFile, readExcelBuffer } from './readers/excel';
import { readWordFile, readWordBuffer } from './readers/word';
import { readPdfFile, readPdfBuffer } from './readers/pdf';
import { skipRows, skipPatternRows } from './preprocessors/skip-rows';
import { detectCards, extractFromCard } from './preprocessors/card-splitter';
import { mergeSheets } from './preprocessors/sheet-merger';
import { splitOrders } from './preprocessors/order-splitter';
import { mapFields } from './mappers/column-mapper';
import { aggregateRecords } from './transformers/aggregator';
import { transposeMatrix, transposeMatrixWithMapping } from './transformers/matrix-transposer';
import { splitCell } from './transformers/cell-splitter';
import { validateRecords } from './validators';
import { RawDataGrid, RuleConfig } from '@/types/rule';
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
    rawData = mergeSheets(rawData);
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

  // 确定表头和数据行
  const headerRowIndex = ruleConfig.headerRow - 1;
  const headers = headerRowIndex >= 0 && headerRowIndex < dataRows.length
    ? dataRows[headerRowIndex]
    : [];

  const dataStartRow = Math.max(ruleConfig.dataStartRow - 1, headerRowIndex + 1);
  const dataEndRow = ruleConfig.dataEndMode === 'fixed' && ruleConfig.dataEndRow
    ? ruleConfig.dataEndRow - 1
    : dataRows.length;

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
    const tailText = dataRows.slice(dataStartRow).map(r => r.join(' ')).join('\n');

    for (let i = dataStartRow; i < dataEndRow && i < dataRows.length; i++) {
      const row = dataRows[i];
      if (row.every(c => !c)) continue; // 跳过空行

      const mapped = mapFields(row, headers, ruleConfig.fieldMapping, tailText, ruleConfig.defaultValues);

      // 如果所有SKU字段都为空，可能是非数据行
      if (!mapped.skuCode && !mapped.skuName && !mapped.skuQuantity) {
        continue;
      }

      records.push({
        externalCode: mapped.externalCode || '',
        recipientStore: mapped.recipientStore || '',
        recipientName: mapped.recipientName || '',
        recipientPhone: mapped.recipientPhone || '',
        recipientAddress: mapped.recipientAddress || '',
        skuCode: mapped.skuCode || '',
        skuName: mapped.skuName || '',
        skuQuantity: parseInt(mapped.skuQuantity, 10) || 0,
        skuSpec: mapped.skuSpec || '',
        remark: mapped.remark || '',
        rowIndex: rowIndex++,
      });
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
