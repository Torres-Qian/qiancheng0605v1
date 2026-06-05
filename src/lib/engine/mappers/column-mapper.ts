import { FieldMapping, FieldMappingItem, RawDataGrid } from '@/types/rule';

// 列映射：根据列名找到值
export function mapColumn(row: string[], headers: string[], item: FieldMappingItem): string {
  if (!item.value) return '';

  // 尝试精确匹配
  let colIndex = headers.findIndex(h => h.trim() === item.value!.trim());
  // 尝试包含匹配
  if (colIndex === -1) {
    colIndex = headers.findIndex(h => h.includes(item.value!.trim()));
  }
  // 尝试正则匹配
  if (colIndex === -1) {
    colIndex = headers.findIndex(h => new RegExp(item.value!.trim(), 'i').test(h));
  }

  if (colIndex === -1 || colIndex >= row.length) return '';
  return (row[colIndex] || '').trim();
}

// 尾部区域提取：在数据行之外的尾部区域搜索匹配
export function extractFromTail(rawText: string, matchPattern: string): string {
  if (!matchPattern) return '';
  const regex = new RegExp(matchPattern, 'i');
  const match = rawText.match(regex);
  return match ? (match[1] || match[0]).trim() : '';
}

// 正则映射：用正则从整行/整段文本中提取
export function mapRegex(text: string, matchPattern: string): string {
  if (!matchPattern) return '';
  const regex = new RegExp(matchPattern, 'i');
  const match = text.match(regex);
  return match ? (match[1] || match[0]).trim() : '';
}

// 静态值映射
export function mapStatic(item: FieldMappingItem): string {
  return item.value || '';
}

// 执行字段映射
export function mapFields(
  row: string[],
  headers: string[],
  fieldMapping: FieldMapping,
  tailText: string,
  defaultValues: Record<string, string>
): Record<string, string> {
  const result: Record<string, string> = {};
  const rowText = row.join(' ');

  const fieldNames: (keyof FieldMapping)[] = [
    'externalCode', 'recipientStore', 'recipientName', 'recipientPhone',
    'recipientAddress', 'skuCode', 'skuName', 'skuQuantity', 'skuSpec', 'remark',
  ];

  for (const field of fieldNames) {
    const item = fieldMapping[field];
    if (!item) continue;

    let value = '';
    switch (item.source) {
      case 'column':
        value = mapColumn(row, headers, item);
        break;
      case 'tailRegion':
        value = extractFromTail(tailText, item.matchPattern || '');
        break;
      case 'regex':
        value = mapRegex(rowText, item.matchPattern || '');
        break;
      case 'static':
        value = mapStatic(item);
        break;
      case 'cellContent':
        value = rowText;
        break;
      default:
        value = '';
    }

    // 应用默认值
    if (!value && defaultValues[field]) {
      value = defaultValues[field];
    }

    result[field] = value;
  }

  return result;
}
