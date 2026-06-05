import { WaybillRecord } from '@/types/waybill';
import { CellSplitConfig } from '@/types/rule';

// 复合单元格拆分：将 "物品名x数量\n物品名x数量" 拆为多行
export function splitCell(
  records: WaybillRecord[],
  config: CellSplitConfig
): WaybillRecord[] {
  if (!config.enabled) return records;

  const result: WaybillRecord[] = [];
  let rowIndex = 0;

  for (const record of records) {
    const value = (record as any)[config.targetField] || '';
    if (!value || typeof value !== 'string') {
      result.push({ ...record, rowIndex: rowIndex++ });
      continue;
    }

    // 按分隔符拆分
    const items = value.split(new RegExp(config.separator)).map(s => s.trim()).filter(Boolean);

    if (items.length <= 1) {
      result.push({ ...record, rowIndex: rowIndex++ });
      continue;
    }

    // 每个item拆分为独立行
    for (const item of items) {
      let itemName = item;
      let itemQty = 1;

      // 尝试用itemPattern匹配
      if (config.itemPattern) {
        const regex = new RegExp(config.itemPattern, 'i');
        const match = item.match(regex);
        if (match) {
          itemName = match.groups?.name || match[1] || item;
          itemQty = parseInt(match.groups?.qty || match[2] || '1', 10) || 1;
        } else {
          // 尝试 x数字 模式
          const xMatch = item.match(/(.+?)[xX×](\d+)\s*$/);
          if (xMatch) {
            itemName = xMatch[1].trim();
            itemQty = parseInt(xMatch[2], 10) || 1;
          }
        }
      }

      result.push({
        ...record,
        [config.targetField]: itemName,
        skuQuantity: config.targetField === 'skuName' ? itemQty : record.skuQuantity,
        rowIndex: rowIndex++,
      });
    }
  }

  return result;
}
