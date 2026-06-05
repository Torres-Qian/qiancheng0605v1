import * as XLSX from 'xlsx';
import { WaybillRecord } from '@/types/waybill';

export function exportToExcel(records: WaybillRecord[], fileName: string = '出库单数据'): void {
  const data = records.map((r, i) => ({
    '序号': i + 1,
    '外部编码': r.externalCode || '',
    '收货门店': r.recipientStore || '',
    '收件人姓名': r.recipientName || '',
    '收件人电话': r.recipientPhone || '',
    '收件人地址': r.recipientAddress || '',
    'SKU编码': r.skuCode || '',
    'SKU名称': r.skuName || '',
    'SKU数量': r.skuQuantity || '',
    'SKU规格': r.skuSpec || '',
    '备注': r.remark || '',
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '出库单');

  // 设置列宽
  ws['!cols'] = [
    { wch: 6 }, { wch: 20 }, { wch: 25 }, { wch: 12 },
    { wch: 14 }, { wch: 35 }, { wch: 14 }, { wch: 20 },
    { wch: 10 }, { wch: 16 }, { wch: 20 },
  ];

  XLSX.writeFile(wb, `${fileName}.xlsx`);
}
