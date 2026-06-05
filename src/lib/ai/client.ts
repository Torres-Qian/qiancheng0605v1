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
- 特征：第1行是表头，从第2行起每行包含完整信息
- fieldMapping 示例：skuCode 的 value 填 "物品编码"（表头列名），source 填 "column"
- 如果收货人信息在表格外的尾部区域，使用 source: "tailRegion"

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

## 字段定义：
- externalCode: 外部编码/配送单号
- recipientStore: 收货门店
- recipientName: 收件人姓名
- recipientPhone: 收件人电话
- recipientAddress: 收件人地址
- skuCode: SKU物品编码
- skuName: SKU物品名称
- skuQuantity: SKU发货数量
- skuSpec: SKU规格型号
- remark: 备注

## 重要规则：
1. fieldMapping 中 value 永远填表头的列名文本（字符串），不能填数字索引
2. 如果是矩阵转置类型，matrixTransform 中 startCol 和 endCol 填列索引数字（从0开始）
3. 仔细分析表头行，找出每个字段对应的列名
4. 如果某个字段在表格中找不到对应列，source 设为 "static"，value 设为 ""
5. confidence 每个字段都要有，high/medium/low`;

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
