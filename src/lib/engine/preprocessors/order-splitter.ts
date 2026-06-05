import { RawDataGrid, MultiOrderSplitConfig } from '@/types/rule';

interface OrderBlock {
  rows: string[][];
  orderName?: string;
}

// 拆分多订单（PDF多单用）
export function splitOrders(data: RawDataGrid, config: MultiOrderSplitConfig): OrderBlock[] {
  if (!config.enabled) return [{ rows: data.rows }];

  const orders: OrderBlock[] = [];
  let currentOrder: OrderBlock = { rows: [] };
  const splitRegex = new RegExp(config.splitPattern, 'i');
  const nameRegex = config.orderNamePattern ? new RegExp(config.orderNamePattern, 'i') : null;

  for (const row of data.rows) {
    const rowText = row.join(' ').trim();
    if (!rowText) continue;

    if (splitRegex.test(rowText)) {
      if (currentOrder.rows.length > 0) {
        orders.push(currentOrder);
      }
      const nameMatch = nameRegex ? rowText.match(nameRegex) : null;
      currentOrder = {
        rows: [],
        orderName: nameMatch ? (nameMatch[1] || rowText).trim() : rowText.trim(),
      };
    } else {
      currentOrder.rows.push(row);
    }
  }

  if (currentOrder.rows.length > 0) {
    orders.push(currentOrder);
  }

  return orders;
}
