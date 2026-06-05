import { WaybillRecord } from '@/types/waybill';
import { AggregationConfig } from '@/types/rule';

// 跨行聚合：按分组字段将多行合并，共享字段取第一个非空值
export function aggregateRecords(
  records: WaybillRecord[],
  config: AggregationConfig
): WaybillRecord[] {
  if (!config.enabled || !config.groupByField) return records;

  const groups = new Map<string, WaybillRecord[]>();

  for (const record of records) {
    const key = (record as any)[config.groupByField] || '__no_group__';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(record);
  }

  const result: WaybillRecord[] = [];
  let rowIndex = 0;

  for (const [, group] of groups) {
    // 第一条记录作为基础
    const base = { ...group[0] };

    // 共享字段：取第一个非空值
    for (const field of config.sharedFields) {
      if ((base as any)[field]) continue;
      for (const record of group) {
        if ((record as any)[field]) {
          (base as any)[field] = (record as any)[field];
          break;
        }
      }
    }

    // SKU行：每个group中的每条记录保持独立SKU
    for (const record of group) {
      result.push({
        ...base,
        skuCode: record.skuCode || '',
        skuName: record.skuName || '',
        skuQuantity: record.skuQuantity || 0,
        skuSpec: record.skuSpec || '',
        remark: record.remark || '',
        rowIndex: rowIndex++,
      });
    }
  }

  return result;
}
