import { WaybillRecord } from '@/types/waybill';
import { MatrixTransformConfig, FieldMapping, RawDataGrid } from '@/types/rule';

// 通过列名查找列索引
function findColumnIndex(headers: string[], colName: string): number {
  // 精确匹配
  const exact = headers.findIndex(h => h.trim() === colName.trim());
  if (exact !== -1) return exact;
  // 包含匹配
  const includes = headers.findIndex(h => h.includes(colName.trim()));
  if (includes !== -1) return includes;
  return -1;
}

// 矩阵转置：将列头横向展开的数据转置为独立运单记录
// 适用场景：SKU×门店矩阵 —— 第一列是SKU信息，后续列是门店名，单元格是数量
export function transposeMatrix(
  data: RawDataGrid,
  config: MatrixTransformConfig,
  headerRowIndex: number
): WaybillRecord[] {
  if (!config.enabled) return [];

  const records: WaybillRecord[] = [];
  const rows = data.rows;
  let rowIndex = 0;

  const headerRow = rows[headerRowIndex] || [];
  const dataStartRow = headerRowIndex + 1;

  const startCol = config.startCol || 1;
  const endCol = config.endCol || headerRow.length;

  // 遍历数据行
  for (let r = dataStartRow; r < rows.length; r++) {
    const row = rows[r];

    // 检查是否是有效数据行（至少第一列有内容）
    const rowLabel = row[0]?.trim();
    if (!rowLabel) continue;

    // 遍历门店列（从 startCol 到 endCol）
    for (let c = startCol; c < endCol && c < row.length; c++) {
      const storeName = headerRow[c]?.trim(); // 列标签 = 门店名
      const quantityStr = (row[c] || '').trim();

      if (!storeName || !quantityStr) continue;

      const quantity = parseInt(quantityStr, 10);
      if (isNaN(quantity) || quantity <= 0) continue;

      records.push({
        externalCode: '',
        recipientStore: storeName,           // 列标签 = 收货门店
        recipientName: '',
        recipientPhone: '',
        recipientAddress: '',
        skuCode: '',
        skuName: rowLabel,                    // 第一列 = SKU名称（暂时，下面会覆盖）
        skuQuantity: quantity,               // 单元格值 = 数量
        skuSpec: '',
        remark: '',
        rowIndex: rowIndex++,
        // 保留原始行数据供后续映射使用
        _rawRow: row,
        _storeCol: c,
      } as any);
    }
  }

  return records;
}

// 矩阵转置 + 字段映射：先转置，再用列映射填充SKU信息
export function transposeMatrixWithMapping(
  data: RawDataGrid,
  config: MatrixTransformConfig,
  fieldMapping: FieldMapping,
  headerRowIndex: number
): WaybillRecord[] {
  // 先执行转置
  const records = transposeMatrix(data, config, headerRowIndex);
  if (records.length === 0) return [];

  const headerRow = data.rows[headerRowIndex] || [];
  const dataStartRow = headerRowIndex + 1;

  // 构建尾部文本，用于 tailRegion 提取（全量数据行，确保表头之前的信息也能提取）
  const tailText = data.rows.map(r => r.join(' ')).join('\n');

  // 辅助：从 fieldMapping 取值
  const getFieldValue = (item: FieldMappingItem | undefined, row: string[]): string => {
    if (!item) return '';
    if (item.source === 'static' && item.value) return item.value;
    if (item.source === 'column' && item.value) {
      const colIdx = findColumnIndex(headerRow, item.value);
      if (colIdx >= 0 && colIdx < row.length) return (row[colIdx] || '').trim();
    }
    return '';
  };

  // 辅助：从 tailText 提取（全局一次）
  const getTailValue = (item: FieldMappingItem | undefined): string => {
    if (!item || !item.matchPattern) return '';
    // 简单关键词自动构建正则
    const hasRegexChars = /[()\[\]{}|\\^$.*+?]/.test(item.matchPattern);
    const regex = hasRegexChars
      ? new RegExp(item.matchPattern, 'i')
      : new RegExp(item.matchPattern + '\\s*[:：]?\\s*(\\S+)', 'i');
    const match = tailText.match(regex);
    return match ? (match[1] || match[0]).trim() : '';
  };

  // 用 fieldMapping 从原始行中提取 SKU 信息
  for (const record of records) {
    const rawRow = (record as any)._rawRow as string[] | undefined;
    if (!rawRow) continue;

    // SKU编码
    if (fieldMapping.skuCode?.source === 'column' && fieldMapping.skuCode.value) {
      const colIdx = findColumnIndex(headerRow, fieldMapping.skuCode.value);
      if (colIdx >= 0 && colIdx < rawRow.length) {
        record.skuCode = (rawRow[colIdx] || '').trim();
      }
    }

    // SKU名称
    if (fieldMapping.skuName?.source === 'column' && fieldMapping.skuName.value) {
      const colIdx = findColumnIndex(headerRow, fieldMapping.skuName.value);
      if (colIdx >= 0 && colIdx < rawRow.length) {
        const val = (rawRow[colIdx] || '').trim();
        if (val) record.skuName = val;
      }
    }

    // SKU规格
    if (fieldMapping.skuSpec?.source === 'column' && fieldMapping.skuSpec.value) {
      const colIdx = findColumnIndex(headerRow, fieldMapping.skuSpec.value);
      if (colIdx >= 0 && colIdx < rawRow.length) {
        record.skuSpec = (rawRow[colIdx] || '').trim();
      }
    }

    // 外部编码 — 从行/尾部提取
    const extVal = getFieldValue(fieldMapping.externalCode, rawRow);
    if (extVal) record.externalCode = extVal;

    // 收件人姓名 / 电话 / 地址 / 备注 — 优先 static，其次 tailRegion
    const recipientNameVal = getFieldValue(fieldMapping.recipientName, rawRow);
    if (recipientNameVal) record.recipientName = recipientNameVal;

    const recipientPhoneVal = getFieldValue(fieldMapping.recipientPhone, rawRow);
    if (recipientPhoneVal) record.recipientPhone = recipientPhoneVal;

    const recipientAddressVal = getFieldValue(fieldMapping.recipientAddress, rawRow);
    if (recipientAddressVal) record.recipientAddress = recipientAddressVal;

    const remarkVal = getFieldValue(fieldMapping.remark, rawRow);
    if (remarkVal) record.remark = remarkVal;

    // 清理临时字段
    delete (record as any)._rawRow;
    delete (record as any)._storeCol;
  }

  // 全局提取一次 tailRegion 字段，应用到所有记录
  const tailRecipientName = !records.some(r => r.recipientName) ? getTailValue(fieldMapping.recipientName) : '';
  const tailRecipientPhone = !records.some(r => r.recipientPhone) ? getTailValue(fieldMapping.recipientPhone) : '';
  const tailRecipientAddress = !records.some(r => r.recipientAddress) ? getTailValue(fieldMapping.recipientAddress) : '';
  const tailRemark = !records.some(r => r.remark) ? getTailValue(fieldMapping.remark) : '';
  const tailExternalCode = !records.some(r => r.externalCode) ? getTailValue(fieldMapping.externalCode) : '';

  if (tailRecipientName || tailRecipientPhone || tailRecipientAddress || tailRemark || tailExternalCode) {
    for (const record of records) {
      if (tailRecipientName) record.recipientName = tailRecipientName;
      if (tailRecipientPhone) record.recipientPhone = tailRecipientPhone;
      if (tailRecipientAddress) record.recipientAddress = tailRecipientAddress;
      if (tailRemark) record.remark = tailRemark;
      if (tailExternalCode) record.externalCode = tailExternalCode;
    }
  }

  return records;
}
