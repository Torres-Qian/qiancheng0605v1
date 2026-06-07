// 预览解析 API - 接收文件 + 规则配置，返回解析结果
import { NextRequest, NextResponse } from 'next/server';
import { readFileFromBuffer } from '@/lib/engine';
import { skipRows, skipPatternRows } from '@/lib/engine/preprocessors/skip-rows';
import { mergeSheets } from '@/lib/engine/preprocessors/sheet-merger';
import { detectCards, extractFromCard } from '@/lib/engine/preprocessors/card-splitter';
import { splitOrders } from '@/lib/engine/preprocessors/order-splitter';
import { mapFields, extractFromTail } from '@/lib/engine/mappers/column-mapper';
import { aggregateRecords } from '@/lib/engine/transformers/aggregator';
import { transposeMatrixWithMapping } from '@/lib/engine/transformers/matrix-transposer';
import { splitCell } from '@/lib/engine/transformers/cell-splitter';
import { validateRecords } from '@/lib/engine/validators';
import { RuleConfig, FieldMapping } from '@/types/rule';
import { WaybillRecord } from '@/types/waybill';

const MAX_PREVIEW_RECORDS = 200;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const ruleConfigStr = formData.get('ruleConfig') as string | null;

    if (!file) {
      return NextResponse.json({ success: false, error: '未提供文件' }, { status: 400 });
    }
    if (!ruleConfigStr) {
      return NextResponse.json({ success: false, error: '未提供规则配置' }, { status: 400 });
    }

    let ruleConfig: RuleConfig;
    try {
      ruleConfig = JSON.parse(ruleConfigStr);
    } catch {
      return NextResponse.json({ success: false, error: '规则配置格式无效' }, { status: 400 });
    }

    // 读取文件
    const arrayBuffer = await file.arrayBuffer();
    const rawData = await readFileFromBuffer(arrayBuffer, file.name);

    // 执行解析流程（复用 processSingleOrder 逻辑）
    const { records, validationErrors, parseWarnings, parseErrors, diagnostic } = processFileWithRule(rawData, ruleConfig);

    const totalRows = records.length;
    const truncated = totalRows > MAX_PREVIEW_RECORDS;

    return NextResponse.json({
      success: true,
      data: {
        records: truncated ? records.slice(0, MAX_PREVIEW_RECORDS) : records,
        validationErrors,
        parseWarnings,
        parseErrors,
        totalRows,
        truncated,
        diagnostic,
      },
    });
  } catch (err: any) {
    console.error('预览解析失败:', err.message);
    return NextResponse.json({ success: false, error: err.message || '解析失败' }, { status: 500 });
  }
}

function processFileWithRule(
  rawData: any,
  ruleConfig: RuleConfig
): {
  records: WaybillRecord[];
  validationErrors: any[];
  parseWarnings: string[];
  parseErrors: string[];
  diagnostic: Record<string, any>;
} {
  const warnings: string[] = [];
  const errors: string[] = [];
  let records: WaybillRecord[] = [];
  let diagnostic: Record<string, any> = {};

  // 多Sheet合并
  console.log(`[Preview] sheetMode=${ruleConfig.sheetMode}, 合并前rows=${rawData.rows.length}, sheets数=${Object.keys(rawData.sheets || {}).length}`);
  if (ruleConfig.sheetMode === 'all') {
    const headerRowIdx = ruleConfig.headerRow - 1;
    rawData = mergeSheets(rawData, headerRowIdx);
  } else if (ruleConfig.sheetMode === 'multi' && ruleConfig.sheetNames) {
    const mergedRows: string[][] = [];
    for (const name of ruleConfig.sheetNames) {
      const sheet = rawData.sheets?.[name];
      if (sheet) mergedRows.push(...sheet.rows);
    }
    if (mergedRows.length > 0) {
      rawData = { ...rawData, rows: mergedRows, metadata: { ...rawData.metadata, totalRows: mergedRows.length } };
    }
  }

  // 多订单拆分
  if (ruleConfig.multiOrderSplit?.enabled) {
    const orders = splitOrders(rawData, ruleConfig.multiOrderSplit);
    for (const order of orders) {
      const orderData = { ...rawData, rows: order.rows, rawText: order.rows.map((r: string[]) => r.join(' ')).join('\n') };
      const { records: orderRecords } = processSingleOrderInternalWithDiag(orderData, ruleConfig, warnings, errors);
      records = records.concat(orderRecords);
    }
  } else {
    const result = processSingleOrderInternalWithDiag(rawData, ruleConfig, warnings, errors);
    records = result.records;
    diagnostic = result.diagnostic;
  }

  const validationErrors = validateRecords(records);

  return { records, validationErrors, parseWarnings: warnings, parseErrors: errors, diagnostic };
}

function processSingleOrderInternalWithDiag(
  rawData: any,
  ruleConfig: RuleConfig,
  warnings: string[],
  errors: string[]
): { records: WaybillRecord[]; diagnostic: Record<string, any> } {
  let records: WaybillRecord[] = [];
  const diagnostic: Record<string, any> = {};

  // 卡片式处理
  if (ruleConfig.cardDetection?.enabled) {
    const cards = detectCards(rawData, ruleConfig.cardDetection);
    let rowIndex = 0;
    for (const card of cards) {
      const cardFields = extractFromCard(card, ruleConfig.cardDetection);
      const itemRows = card.rows.filter((r: string[]) => r.length > 1);
      if (itemRows.length === 0) {
        warnings.push(`卡片"${card.title}"中未找到物品数据`);
        continue;
      }

      let itemHeaderIndex = 0;
      for (let i = 0; i < itemRows.length; i++) {
        if (itemRows[i].some((c: string) => /编码|名称|数量|规格/.test(c))) {
          itemHeaderIndex = i;
          break;
        }
      }
      const itemHeaders = itemRows[itemHeaderIndex];
      const itemDataRows = itemRows.slice(itemHeaderIndex + 1);

      for (const row of itemDataRows) {
        const mapped = mapFields(row, itemHeaders, ruleConfig.fieldMapping, card.rows.map((r: string[]) => r.join(' ')).join('\n'), ruleConfig.defaultValues);
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
    return { records, diagnostic };
  }

  // 标准表格处理
  let processed = skipRows(rawData, ruleConfig.skipRows.top, ruleConfig.skipRows.bottom);
  processed = skipPatternRows(processed.data, ruleConfig.skipRowsPattern);

  const dataRows = processed.data.rows;
  if (dataRows.length === 0) {
    errors.push('没有可解析的数据行');
    return { records, diagnostic };
  }

  // 表头行号相对于跳过之后的数据行
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
    if (dataEndRow < dataStartRow) dataEndRow = dataStartRow;
  }

  // 服务端日志：关键诊断信息
  console.log(`[Preview] skipRows: top=${ruleConfig.skipRows.top} bottom=${ruleConfig.skipRows.bottom}, headerRow=${ruleConfig.headerRow}, dataStartRow=${ruleConfig.dataStartRow}, dataColumnStartRow=${ruleConfig.dataColumnStartRow}`);
  console.log(`[Preview] 处理后: headerRowIndex=${headerRowIndex}, dataStartRow=${dataStartRow}, dataEndRow=${dataEndRow}, totalRows=${dataRows.length}`);
  console.log(`[Preview] headers (共${headers.length}列): [${headers.map(h => `"${h}"`).join(', ')}]`);
  for (let i = dataStartRow; i < Math.min(dataStartRow + 5, dataEndRow, dataRows.length); i++) {
    console.log(`[Preview] 数据行${i}: [${dataRows[i].map(c => `"${c}"`).join(', ')}]`);
  }

  // 诊断：收集表头和字段匹配信息
  diagnostic.headers = headers;
  diagnostic.headerRowIndex = headerRowIndex;
  diagnostic.dataStartRow = dataStartRow;
  diagnostic.dataEndRow = dataEndRow;
  diagnostic.totalDataRows = dataRows.length;
  // 原始数据行样本（前 15 行，用于排查 PDF 聚类/列对齐问题）
  diagnostic.sampleRows = dataRows.slice(0, 15).map((r: string[], i: number) => ({
    rowIndex: i,
    isHeader: i === headerRowIndex,
    cells: r,
  }));

  // 检查每个字段映射的列名是否在表头中找到
  const fieldNames: string[] = [
    'externalCode', 'recipientStore', 'recipientName', 'recipientPhone',
    'recipientAddress', 'skuCode', 'skuName', 'skuQuantity', 'skuSpec', 'remark',
  ];

  // 诊断：记录服务器收到的字段配置（用于排查配置传递问题）
  diagnostic.configSnapshot = {};
  for (const f of fieldNames) {
    const it = ruleConfig.fieldMapping?.[f as keyof typeof ruleConfig.fieldMapping];
    diagnostic.configSnapshot[f] = it ? { source: it.source, value: it.value || '', matchPattern: it.matchPattern || '' } : null;
  }
  const fieldLabels: Record<string, string> = {
    externalCode: '外部编码',
    recipientStore: '收货门店',
    recipientName: '收件人姓名',
    recipientPhone: '收件人电话',
    recipientAddress: '收件人地址',
    skuCode: 'SKU物品编码',
    skuName: 'SKU物品名称',
    skuQuantity: 'SKU发货数量',
    skuSpec: 'SKU规格型号',
    remark: '备注',
  };

  // 辅助函数：模拟 mapColumn 的完整匹配链路，输出匹配详情
  function simulateColumnMatch(searchVal: string): {
    exact: number; includes: number; regex: number; noSpaceExact: number; noSpaceIncludes: number;
  } {
    const sv = searchVal.trim();
    const svNoSpace = sv.replace(/\s+/g, '');
    return {
      exact: headers.findIndex((h: string) => h.trim() === sv),
      includes: headers.findIndex((h: string) => h.includes(sv)),
      regex: headers.findIndex((h: string) => { try { return new RegExp(sv, 'i').test(h); } catch { return false; }}),
      noSpaceExact: headers.findIndex((h: string) => h.replace(/\s+/g, '') === svNoSpace),
      noSpaceIncludes: headers.findIndex((h: string) => h.replace(/\s+/g, '').includes(svNoSpace)),
    };
  }

  const fieldMatches: Record<string, any> = {};
  for (const field of fieldNames) {
    const item = ruleConfig.fieldMapping?.[field as keyof typeof ruleConfig.fieldMapping];
    if (!item) {
      fieldMatches[field] = { label: fieldLabels[field], mapped: false, reason: '未配置', configValue: '', source: 'none' };
      continue;
    }

    const source = item.source;

    // 列映射：检查列名是否在表头中找到
    if (source === 'column') {
      if (!item.value) {
        fieldMatches[field] = { label: fieldLabels[field], mapped: false, reason: '未填写列名', configValue: '', source };
        continue;
      }

      const sim = simulateColumnMatch(item.value.trim());
      const colIndex = sim.exact >= 0 ? sim.exact
        : sim.includes >= 0 ? sim.includes
        : sim.regex >= 0 ? sim.regex
        : sim.noSpaceExact >= 0 ? sim.noSpaceExact
        : sim.noSpaceIncludes >= 0 ? sim.noSpaceIncludes
        : -1;

      fieldMatches[field] = {
        label: fieldLabels[field],
        mapped: colIndex >= 0,
        configValue: item.value,
        matchedColumn: colIndex >= 0 ? headers[colIndex].trim() : null,
        colIndex,
        source,
        // 详细匹配链，帮助诊断为什么匹配不到
        matchChain: sim,
      };
      continue;
    }

    // 尾部提取
    if (source === 'tailRegion') {
      const hasRegexChars = item.matchPattern ? /[()\[\]{}|\\^$.*+?]/.test(item.matchPattern) : false;
      const displayValue = hasRegexChars
        ? `自定义正则: ${item.matchPattern}`
        : item.matchPattern
          ? `关键词「${item.matchPattern}」→ 自动匹配冒号或空格分隔格式`
          : '';
      fieldMatches[field] = {
        label: fieldLabels[field],
        mapped: !!item.matchPattern,
        configValue: displayValue,
        source,
        reason: item.matchPattern ? undefined : '未填写关键词',
      };
      continue;
    }

    // 正则匹配
    if (source === 'regex') {
      fieldMatches[field] = {
        label: fieldLabels[field],
        mapped: !!item.matchPattern,
        configValue: item.matchPattern || '',
        source,
        reason: item.matchPattern ? undefined : '未填写匹配正则',
      };
      continue;
    }

    // 静态值
    if (source === 'static') {
      fieldMatches[field] = {
        label: fieldLabels[field],
        mapped: true,
        configValue: item.value || '(空值)',
        source,
      };
      continue;
    }

    // cellContent 整行捕获
    if (source === 'cellContent') {
      fieldMatches[field] = {
        label: fieldLabels[field],
        mapped: true,
        configValue: '整行内容',
        source,
      };
      continue;
    }

    fieldMatches[field] = { label: fieldLabels[field], mapped: false, reason: '未知来源类型', configValue: '', source };
  }
  diagnostic.fieldMatches = fieldMatches;

  // 矩阵转置
  if (ruleConfig.matrixTransform?.enabled) {
    records = transposeMatrixWithMapping(
      { ...rawData, rows: dataRows },
      ruleConfig.matrixTransform,
      ruleConfig.fieldMapping,
      headerRowIndex
    );
  } else {
    let rowIndex = 0;
    let skippedCount = 0;
    // tailText 包含全量数据行，确保表头之前的尾部信息也能被提取到
    const tailText = dataRows.map((r: string[]) => r.join(' ')).join('\n');

    // 获取行号→Sheet名称映射（合并Sheet时使用）
    const rowSheetMap = (rawData.metadata as any)?.rowSheetMap as string[] | undefined;

    // 为指定行获取其所属Sheet的尾部文本
    // 注：rowSheetMap 是 skipRows 之前的索引，需加上 skipRows.top 偏移
    const rowOffset = ruleConfig.skipRows.top || 0;
    function getTailTextForRow(rowIdx: number): string {
      const sheetName = rowSheetMap?.[rowIdx + rowOffset];
      if (!sheetName || !rawData.sheets?.[sheetName]) return tailText;
      return rawData.sheets[sheetName].rows.map((r: string[]) => r.join(' ')).join('\n');
    }

    // 判断当前行是否属于其Sheet的底部跳过范围（columnSkipBottomRows）
    // 每个Sheet独立计算：从所属Sheet末尾往前数N行
    const sheetRowCount: Record<string, number> = {};
    if (rowSheetMap && ruleConfig.columnSkipBottomRows && ruleConfig.columnSkipBottomRows > 0) {
      for (const sn of rowSheetMap) {
        sheetRowCount[sn] = (sheetRowCount[sn] || 0) + 1;
      }
    }
    function isInSheetBottom(rowIdx: number): boolean {
      if (!rowSheetMap || !ruleConfig.columnSkipBottomRows) return false;
      const sn = rowSheetMap[rowIdx + rowOffset];
      if (!sn) return false;
      // 往后数还有多少行属于同一个Sheet
      let remaining = 0;
      for (let j = rowIdx + rowOffset; j < rowSheetMap.length && rowSheetMap[j] === sn; j++) {
        remaining++;
      }
      return remaining <= ruleConfig.columnSkipBottomRows;
    }

    // 预先提取通用字段（仅 static 类型，tailRegion 由每行独立提取避免跨Sheet污染）
    const commonFields: (keyof FieldMapping)[] = [
      'externalCode', 'recipientStore', 'recipientName',
      'recipientPhone', 'recipientAddress', 'remark',
    ];
    const mergedDefaults: Record<string, string> = { ...ruleConfig.defaultValues };
    for (const field of commonFields) {
      const item = ruleConfig.fieldMapping[field];
      if (!item || mergedDefaults[field]) continue;

      if (item.source === 'static' && item.value) {
        mergedDefaults[field] = item.value;
      } else if (item.source === 'tailRegion' && item.matchPattern && !rowSheetMap) {
        // 仅在非多Sheet合并时预提取，多Sheet时由每行独立提取避免跨Sheet串值
        const extracted = extractFromTail(tailText, item.matchPattern, field);
        if (extracted) mergedDefaults[field] = extracted;
      }
    }

    // 列映射跳过正则
    const colSkipRegex = ruleConfig.columnSkipPattern ? new RegExp(ruleConfig.columnSkipPattern, 'i') : null;

    for (let i = dataStartRow; i < dataEndRow && i < dataRows.length; i++) {
      const row = dataRows[i];
      if (row.every((c: string) => !c)) continue;

      if (colSkipRegex && colSkipRegex.test(row.join(' '))) {
        skippedCount++;
        continue;
      }

      // 每个Sheet独立跳过底部行（columnSkipBottomRows）
      if (isInSheetBottom(i)) continue;

      const rowTailText = getTailTextForRow(i);
      const mapped = mapFields(row, headers, ruleConfig.fieldMapping, rowTailText, mergedDefaults);

      // 兜底保护：强制注入 static/tailRegion 配置值
      for (const field of commonFields) {
        const item = ruleConfig.fieldMapping[field];
        if (!item || mapped[field]) continue;
        if (item.source === 'static' && item.value) {
          mapped[field] = item.value;
        } else if (item.source === 'tailRegion' && item.matchPattern) {
          const v = extractFromTail(rowTailText, item.matchPattern, field);
          if (v) mapped[field] = v;
        }
      }

      if (!mapped.skuCode && !mapped.skuName && !mapped.skuQuantity) {
        skippedCount++;
        continue;
      }

      records.push({
        externalCode: (mapped.externalCode != null && mapped.externalCode !== '') ? mapped.externalCode : (mergedDefaults.externalCode || ''),
        recipientStore: (mapped.recipientStore != null && mapped.recipientStore !== '') ? mapped.recipientStore : (mergedDefaults.recipientStore || ''),
        recipientName: (mapped.recipientName != null && mapped.recipientName !== '') ? mapped.recipientName : (mergedDefaults.recipientName || ''),
        recipientPhone: (mapped.recipientPhone != null && mapped.recipientPhone !== '') ? mapped.recipientPhone : (mergedDefaults.recipientPhone || ''),
        recipientAddress: (mapped.recipientAddress != null && mapped.recipientAddress !== '') ? mapped.recipientAddress : (mergedDefaults.recipientAddress || ''),
        skuCode: mapped.skuCode || '',
        skuName: mapped.skuName || '',
        skuQuantity: parseInt(mapped.skuQuantity, 10) || 0,
        skuSpec: mapped.skuSpec || '',
        remark: (mapped.remark != null && mapped.remark !== '') ? mapped.remark : (mergedDefaults.remark || ''),
        rowIndex: rowIndex++,
      });
    }

    diagnostic.skippedCount = skippedCount;
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

  // 将第一条记录的实际值放入诊断，方便排查映射问题
  if (records.length > 0) {
    diagnostic.sampleRecord = {
      externalCode: records[0].externalCode,
      recipientStore: records[0].recipientStore,
      recipientName: records[0].recipientName,
      recipientPhone: records[0].recipientPhone,
      recipientAddress: records[0].recipientAddress,
      skuCode: records[0].skuCode,
      skuName: records[0].skuName,
      skuQuantity: records[0].skuQuantity,
      skuSpec: records[0].skuSpec,
      remark: records[0].remark,
    };
  }

  return { records, diagnostic };
}
