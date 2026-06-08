// 大模型 API 客户端
import { AiAnalysisResult, RuleConfig } from '@/types/rule';

interface AiClientConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

function getAiConfig(): AiClientConfig {
  if (process.env.DEEPSEEK_API_KEY) {
    return {
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
      model: process.env.AI_MODEL || 'deepseek-chat',
    };
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      model: process.env.AI_MODEL || 'gpt-4o-mini',
    };
  }
  throw new Error('未配置大模型API Key，请设置 DEEPSEEK_API_KEY 或 OPENAI_API_KEY');
}

export async function callAiModel(messages: { role: string; content: string }[]): Promise<string> {
  const config = getAiConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: 0.3,
        max_tokens: 4096,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`AI API调用失败: ${response.status} ${errText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  } finally {
    clearTimeout(timeout);
  }
}

export async function analyzeFileAndGenerateRule(
  filePreview: string,
  fileName: string,
  fileType: string
): Promise<AiAnalysisResult> {
  const systemPrompt = `你是一个文件解析规则生成专家。你的任务是根据上传的表格文件结构，生成一套JSON格式的解析规则配置。

【重要】fieldMapping 中每个字段的 value 必须是表头中的列名文本（字符串），绝对不能使用列索引数字！

你需要先判断文件属于哪种类型，然后生成对应的规则：

## 类型一：标准表格（每行是一条完整记录）
- 特征：第一行是表头，从第二行起每行包含完整信息
- 数据区域内的 SKU 列（如 SKU编码、SKU名称、数量、规格），source 设为 "column"，value 填表头列名
- 数据区域外（表格下方/尾部）的父级字段（如单据号、收货门店、收货人、收货电话、收货地址），source 设为 "tailRegion"，matchPattern 填对应的关键词（如"收货人"、"收货电话"），value 留空

【重要】如何区分 column 和 tailRegion：
- 出现在表头行（第一行/前几行）中的列名 → source: "column"，value: 列名原文
- 出现在数据行下方、表格外部的信息（通常在文件最后几行）→ source: "tailRegion"，matchPattern: 关键词，value: ""

tailRegion 示例：
  收货人信息在表格下方：
  "单据号"行 → externalCode: { source: "tailRegion", matchPattern: "单据号", value: "" }
  "收货人"行 → recipientName: { source: "tailRegion", matchPattern: "收货人", value: "" }
  "收货电话"行 → recipientPhone: { source: "tailRegion", matchPattern: "收货电话", value: "" }
  "收货地址"行 → recipientAddress: { source: "tailRegion", matchPattern: "收货地址", value: "" }
  "收货门店"行 → recipientStore: { source: "tailRegion", matchPattern: "收货门店", value: "" }

⚠️ 如果某个字段在表头列中已经存在，就用 column；只有在表头中找不到且出现在尾部时，才用 tailRegion

## 类型二：矩阵转置表（SKU×门店矩阵）
- 特征：第一列是 SKU 信息列（编码/名称/规格），后续列是门店名（横向列头），单元格中是数量
- 必须设置 matrixTransform.enabled = true
- matrixTransform 配置：
  * transposeAxis: "columns"（门店名在列头）
  * startCol: 门店列的起始列索引（从0开始，通常是 SKU 信息列之后的第一列）
  * labelField: "recipientStore"（门店名映射到哪个字段）
- fieldMapping 中：
  * skuCode: source "column", value 填 SKU编码列的表头名（如 "SKU编码" 或 "产品编码"）
  * skuName: source "column", value 填 SKU名称列的表头名
  * skuQuantity: source "column", value 填对应的列名
  * recipientStore: source "static", value "" （因为门店信息由矩阵转置生成）

## 类型三：跨行聚合表（多行共享收货信息）
- 特征：同一外部编码下多行 SKU，收货信息只在第一行
- aggregation.enabled = true, groupByField 填 "externalCode"

## 输出JSON格式：
{
  "analysis": "对文件结构的简要分析（中文），必须说明你判断它属于哪种类型",
  "suggestedRule": {
    "version": "1.0",
    "skipRows": { "top": 跳过顶部行数, "bottom": 跳过底部行数 },
    "headerRow": 表头所在行号（从1开始）,
    "sheetMode": "single",
    "dataStartRow": 数据起始行号,
    "dataEndMode": "auto",
    "skipRowsPattern": "合计|总计|小计",
    "columnSkipBottomRows": 0,
    "fieldMapping": { 字段映射对象 },
    "aggregation": { "enabled": false, "groupByField": "externalCode", "sharedFields": [] },
    "matrixTransform": null 或矩阵转置配置对象,
    "cardDetection": null,
    "cellSplitConfig": null,
    "multiOrderSplit": null,
    "defaultValues": {},
    "postProcessors": []
  },
  "confidence": {
    "externalCode": "high",
    "recipientStore": "high",
    ...各字段置信度
  }
}

## 字段匹配规则（column vs tailRegion）：
- 首先检查表头列：如果列名能匹配到下方字段，用 source: "column"，value 填列名
- 如果表头中没有对应列，但文件尾部出现了关键词，用 source: "tailRegion"，matchPattern 填关键词，value 留空
- 两者都没有的字段，source 设为 "static"，value 留空

各字段匹配策略（tableHeaderMatch 表示在表头列中找到；tailKeyword 表示在尾部匹配的关键词）：

- externalCode：
  tableHeaderMatch → "外部编码"、"外部商品编码"、"外部单号"、"订单号"、"配送单号"、"运单号"
  tailKeyword → "单据号"、"出库单号"

- recipientStore：
  tableHeaderMatch → "收货门店"、"收货机构"、"门店"、"店铺"
  tailKeyword → "收货门店"、"收货机构"、"门店"

- recipientName：
  tableHeaderMatch → "收货人"、"收件人"、"联系人"
  tailKeyword → "收货人"、"收件人"、"联系人"

- recipientPhone：
  tableHeaderMatch → "收货电话"、"联系电话"、"手机号"
  tailKeyword → "收货电话"、"联系电话"、"手机号"

- recipientAddress：
  tableHeaderMatch → "收货地址"、"地址"、"详细地址"
  tailKeyword → "收货地址"、"地址"、"详细地址"

- skuCode：只用 column
  匹配 → "物品编码"、"商品编码"、"SKU编码"、"产品编码"、"货号"、"物料编码"
  ⚠️ 带"外部"前缀的编码优先匹配 externalCode；纯"商品编码"/"物品编码"/"SKU编码"才匹配 skuCode

- skuName：只用 column
  匹配 → "物品名称"、"商品名称"、"SKU名称"、"产品名称"、"品名"

- skuQuantity：只用 column
  匹配 → "数量"、"发货数量"、"配送数量"、"出库数量"、"件数"

- skuSpec：只用 column
  匹配 → "规格"、"型号"、"规格型号"、"尺码"

- remark：表头或尾部均可
  tableHeaderMatch → "备注"
  tailKeyword → "备注"

## tailRegion 字段的 matchPattern 必须是尾部区域中实际出现的关键词文本`;

  const userPrompt = `请分析以下文件并生成解析规则。

文件名：${fileName}
文件类型：${fileType}

文件内容预览（前30行）：
${filePreview.slice(0, 8000)}

请严格按照上述格式输出JSON。特别注意：
1. fieldMapping 的 value 必须是列名文本，不能是数字
2. 如果是矩阵转置类型，需要设置 matrixTransform
3. 如果是跨行聚合类型，需要设置 aggregation

只输出JSON，不要有其他内容。`;

  try {
    const response = await callAiModel([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    // 尝试从响应中提取JSON
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('AI未返回有效的JSON格式');
    }

    const result: AiAnalysisResult = JSON.parse(jsonMatch[0]);

    // 后处理：确保 fieldMapping 的 value 是字符串
    const fieldNames = ['externalCode', 'recipientStore', 'recipientName', 'recipientPhone',
      'recipientAddress', 'skuCode', 'skuName', 'skuQuantity', 'skuSpec', 'remark'];
    for (const field of fieldNames) {
      const mapping = (result.suggestedRule.fieldMapping as any)[field];
      if (mapping && mapping.value !== undefined && typeof mapping.value === 'number') {
        mapping.value = String(mapping.value);
      }
    }

    return result;
  } catch (err: any) {
    throw new Error(`AI分析失败: ${err.message}`);
  }
}
