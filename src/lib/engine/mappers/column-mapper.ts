import { FieldMapping, FieldMappingItem, RawDataGrid } from '@/types/rule';

// 列映射：根据列名找到值
export function mapColumn(row: string[], headers: string[], item: FieldMappingItem): string {
  if (!item.value || headers.length === 0) return '';

  const searchVal = item.value.trim();

  // 尝试精确匹配
  let colIndex = headers.findIndex(h => h.trim() === searchVal);
  // 尝试包含匹配
  if (colIndex === -1) {
    colIndex = headers.findIndex(h => h.includes(searchVal));
  }
  // 尝试正则匹配
  if (colIndex === -1) {
    colIndex = headers.findIndex(h => { try { return new RegExp(searchVal, 'i').test(h); } catch { return false; }});
  }
  // 兜底：去除所有空格后匹配（修复 PDF 中 "数 量" vs "数量" 的匹配问题）
  if (colIndex === -1) {
    const searchValNoSpace = searchVal.replace(/\s+/g, '');
    colIndex = headers.findIndex(h => h.replace(/\s+/g, '') === searchValNoSpace);
  }
  if (colIndex === -1) {
    const searchValNoSpace = searchVal.replace(/\s+/g, '');
    colIndex = headers.findIndex(h => h.replace(/\s+/g, '').includes(searchValNoSpace));
  }

  if (colIndex === -1 || colIndex >= row.length) return '';
  return (row[colIndex] || '').trim();
}

// 尾部区域提取：在数据行之外的尾部区域搜索匹配
// 如果 matchPattern 是简单关键词（不含正则特殊字符），自动转换为标准正则：关键词\s*[:：]?\s*(capture)
// 支持冒号分隔（关键词:值）和空格分隔（关键词 值）两种格式
export function extractFromTail(rawText: string, matchPattern: string, fieldName?: string): string {
  if (!matchPattern) return '';

  let regex: RegExp;

  // 检测是否已经是完整正则（包含捕获组或正则特殊字符）
  const hasRegexChars = /[()\[\]{}|\\^$.*+?]/.test(matchPattern);

  if (hasRegexChars) {
    // 已经是正则，直接使用
    regex = new RegExp(matchPattern, 'i');
  } else {
    // 是简单关键词，自动补充冒号和捕获组
    // 如果关键词以 \s 开头说明已经带了前置匹配，直接拼接
    // 支持格式：关键词:值、关键词：值、关键词 值（冒号可选）
    regex = new RegExp(matchPattern + '\\s*[:：]?\\s*(\\S+)', 'i');
  }

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

// ── 兜底扫描：当列映射返回空时，尝试从整行中智能提取 ──
function fallbackExtract(row: string[], field: string, headers: string[], mappedColIdx: number): string {
  // 扫描所有非空、非表头列匹配的单元格
  const candidates = row.filter((c, i) => {
    if (!c || !c.trim()) return false;
    if (i === mappedColIdx) return false; // 跳过已尝试的列
    // 跳过明显是表头列的（包含中文关键词且在所有行中都是表头文本）
    if (headers[i] && c.trim() === headers[i].trim()) return false;
    return true;
  });

  if (field === 'skuQuantity') {
    // 找第一个看起来像数量的值（纯数字或小数）
    for (const c of candidates) {
      const num = parseFloat(c.replace(/[,，\s]/g, ''));
      if (!isNaN(num) && num > 0) return String(num);
    }
    return '';
  }

  if (field === 'skuName') {
    // 找第一个包含中文且不像编码的值
    for (const c of candidates) {
      const hasChinese = /[\u4e00-\u9fff]/.test(c);
      const looksLikeCode = /^[A-Z0-9_\-\.]+$/i.test(c) && c.length > 3;
      if (hasChinese && !looksLikeCode) return c.trim();
    }
    return '';
  }

  if (field === 'skuSpec') {
    // 找包含数字+单位的（如 "500g", "148g*32"）
    for (const c of candidates) {
      if (/\d+\s*(g|kg|ml|L|箱|个|件|包|盒|瓶|袋|桶|罐|mm|cm|m)/i.test(c)) return c.trim();
    }
    return '';
  }

  return '';
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
    let mappedColIdx = -1;
    switch (item.source) {
      case 'column':
        value = mapColumn(row, headers, item);
        // 记录匹配到的列索引（用于兜底扫描排除已匹配列）
        if (item.value && headers.length > 0) {
          const sv = item.value.trim();
          mappedColIdx = headers.findIndex(h => h.trim() === sv);
          if (mappedColIdx === -1) mappedColIdx = headers.findIndex(h => h.includes(sv));
          if (mappedColIdx === -1) mappedColIdx = headers.findIndex(h => h.replace(/\s+/g, '').includes(sv.replace(/\s+/g, '')));
        }
        break;
      case 'tailRegion':
        value = extractFromTail(tailText, item.matchPattern || '', field);
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

    // 兜底扫描：如果列映射没找到值，尝试从整行智能提取
    if (!value && item.source === 'column') {
      value = fallbackExtract(row, field, headers, mappedColIdx);
    }

    // 应用默认值
    if (!value && defaultValues[field]) {
      value = defaultValues[field];
    }

    result[field] = value;
  }

  return result;
}
