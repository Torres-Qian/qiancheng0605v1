# 大模型调用说明

## 使用的模型

本项目使用 **DeepSeek Chat** (deepseek-chat) 作为默认大模型，同时兼容 OpenAI API 格式。

## Prompt 设计思路

### 核心策略

大模型的作用是**分析文件结构并生成解析规则配置**，而非直接解析数据。这种设计的优势：
1. **规则可复用**：同一格式的文件只需分析一次，规则可保存复用
2. **用户可控**：AI生成的规则需用户确认，避免AI幻觉导致错误
3. **性能好**：解析执行在客户端完成，不依赖大模型响应速度

### System Prompt 结构

```
角色：文件解析规则生成专家
任务：根据文件内容的结构，生成JSON格式的解析规则配置

要求：
- 分析文件整体结构（表格型/矩阵型/卡片型/纯文本型）
- 识别干扰头部和尾部信息
- 匹配字段映射关系
- 判断是否需要高级处理（聚合/转置/拆分）
- 为每个字段标注置信度（high/medium/low）
```

### User Prompt 结构

包含以下信息：
1. 文件名和类型
2. 文件前30行预览（文本表格格式）
3. 文件尾部预览
4. 元信息（行列数、Sheet数）
5. 目标字段定义（10个字段）
6. 规则配置 JSON Schema

### 置信度标注

- **high**：明确匹配（列名完全对应）
- **medium**：推测匹配（列名部分对应或模糊匹配），黄色标注
- **low**：不确定（无明确匹配），红色标注，需用户手动确认

## API Key 配置

### 方式一：DeepSeek（推荐）

在 Vercel 环境变量中设置：
```
DEEPSEEK_API_KEY=sk-xxxxx
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
AI_MODEL=deepseek-chat
```

### 方式二：OpenAI 兼容

```
OPENAI_API_KEY=sk-xxxxx
OPENAI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4o-mini
```

## 安全措施

- API Key 仅存储在服务端环境变量中
- 前端通过 `/api/ai/analyze` 代理调用，不暴露 Key
- 请求超时设置为60秒
- 异常时友好提示，不泄露敏感信息
