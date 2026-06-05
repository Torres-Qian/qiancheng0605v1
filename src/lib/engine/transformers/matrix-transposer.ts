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

    // 外部编码
    if (fieldMapping.externalCode?.source === 'column' && fieldMapping.externalCode.value) {
      const colIdx = findColumnIndex(headerRow, fieldMapping.externalCode.value);
      if (colIdx >= 0 && colIdx < rawRow.length) {
        record.externalCode = (rawRow[colIdx] || '').trim();
      }
    }

    // 清理临时字段
    delete (record as any)._rawRow;
    delete (record as any)._storeCol;
  }

  return records;
}
