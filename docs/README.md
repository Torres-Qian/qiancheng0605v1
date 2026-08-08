# 万能导入 V2 — 异步事件驱动重构

基于 Next.js App Router + TypeScript + BullMQ 的异步事件驱动批量导入系统，支持 10,000 单/分钟高并发导入。

## 快速开始

### 环境要求

- Node.js 20+
- PostgreSQL（Neon / Supabase）
- Upstash Redis（BullMQ 消息队列）

### 环境变量

```bash
# 数据库（必填）
DATABASE_URL=postgresql://...

# Redis 队列（必填）
REDIS_URL=rediss://...

# AI 分析（可选）
DEEPSEEK_API_KEY=sk-...
# 或
OPENAI_API_KEY=sk-...
```

### 本地启动

```bash
# 1. 安装依赖
npm install

# 2. 生成数据库迁移
npx drizzle-kit generate
npx drizzle-kit push

# 3. 生成压测数据
npx tsx scripts/seed-data.ts

# 4. 启动开发服务器
npm run dev

# 5. 启动 Outbox Dispatcher（另一个终端）
npx tsx src/lib/queue/dispatcher.ts

# 6. 启动 Import Worker（另一个终端）
npx tsx src/lib/queue/worker.ts
```

### 运行测试

```bash
npx vitest run
npx vitest run --coverage
```

### 压测

```bash
# 安装 k6
# macOS: brew install k6
# Linux: https://k6.io/docs/get-started/installation/

# 运行压测
k6 run scripts/load-test.js -e BASE_URL=http://localhost:3000
```

## 架构概述

```
用户上传文件 → POST /api/import-tasks (≤ 1s 返回 task_id)
  → Transactional Outbox (import_tasks + event_outbox 同事务)
  → Outbox Dispatcher (轮询 event_outbox → 投递 BullMQ)
  → Import Worker × 2 (消费队列 → 批量解析 → 批量校验 → 批量 UPSERT)
  → 前端轮询 GET /api/import-tasks/:taskId (2s 间隔)
```

## 页面路由

| 路由 | 说明 |
|------|------|
| `/` | 工作台首页 |
| `/import` | 导入下单页（上传文件 + 选择规则） |
| `/import/[taskId]` | 任务进度与结果页 |
| `/rules` | 解析规则管理 |
| `/rules/new` | 新建规则（AI 辅助） |
| `/preview` | 数据预览页 |
| `/waybills` | 运单列表 |
| `/monitor` | 监控看板 |
| `/traces` | Trace 检索 |

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/import-tasks` | 上传文件创建异步导入任务 |
| GET | `/api/import-tasks/:taskId` | 查询任务进度 |
| GET | `/api/import-tasks/:taskId/errors` | 查询错误明细（分页+筛选） |
| GET | `/api/import-tasks/:taskId/batches` | 查询批次性能日志 |
| GET | `/api/traces/:traceId` | 全链路 Trace 查询 |
| GET | `/api/import-monitor/summary` | 监控聚合指标 |
| GET/POST | `/api/rules` | 解析规则 CRUD |
| GET | `/api/waybills` | 运单列表 |
| POST | `/api/ai/analyze` | AI 分析生成规则 |

## 部署

### Vercel（前端 + API）

```bash
# 设置环境变量
vercel env add DATABASE_URL
vercel env add REDIS_URL

# 部署
vercel deploy
```

### Railway / Render（Worker 常驻进程）

Worker 需要常驻进程运行，部署在 Railway 或 Render：

```bash
# 启动 Worker
npx tsx src/lib/queue/worker.ts

# 启动 Dispatcher
npx tsx src/lib/queue/dispatcher.ts
```

## 压测验收

1. 生成压测数据：`npx tsx scripts/seed-data.ts`
2. 启动所有服务（dev server + dispatcher + worker）
3. 运行压测：`k6 run scripts/load-test.js`
4. 查看报告：`load-test-report.json`
5. 验收标准：上传 P95 ≤ 1 秒，10,000 行全链路 ≤ 60 秒

## 数据清理

```bash
# 清理压测数据
npx tsx scripts/seed-data.ts  # 自动 TRUNCATE sku_master

# 恢复卡死任务
npx tsx scripts/recover-stale.ts
```

## 提交物清单

- [x] 在线地址：Vercel 可访问 URL
- [x] 源码仓库
- [x] 压测数据脚本：`scripts/seed-data.ts`
- [x] 10,000 行压测 Excel：`test-data/10000-orders.xlsx`
- [x] 压测脚本：`scripts/load-test.js`
- [x] 架构设计文档：`docs/REFACTOR_ASSUMPTIONS.md`
- [x] 单元测试：`tests/import-task.test.ts`
- [x] README
