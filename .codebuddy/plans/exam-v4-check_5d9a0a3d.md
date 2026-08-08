---
name: exam-v4-check
overview: 对远程部署地址进行考试合规检查与压测，覆盖前置红线、异步架构、批量处理等8大考点，输出不符合项清单
todos:
  - id: verify-remote-frontend
    content: 使用 [skill:playwright-cli] 访问 https://qiancheng0605v1.vercel.app/ 验证首页、/import、/monitor、/traces 四个页面的可访问性和功能完整性
    status: completed
  - id: verify-pressure-test-file
    content: 使用 [skill:xlsx] 验证 test-data/10000-orders.xlsx 的行数、SKU 分布、非法数据插入
    status: completed
  - id: run-load-test
    content: 执行 k6 压测脚本 scripts/load-test.js 验证上传 P95 ≤ 1s 和 10,000 行全链路 ≤ 60s 目标
    status: completed
    dependencies:
      - verify-remote-frontend
      - verify-pressure-test-file
  - id: expand-unit-tests
    content: 扩展 tests/import-task.test.ts 补充 Outbox 事务、Worker 幂等、降级触发等测试用例
    status: completed
  - id: generate-compliance-report
    content: 汇总所有检查结果，输出最终不符合项清单和预估得分
    status: completed
    dependencies:
      - run-load-test
      - expand-unit-tests
---

## 考试合规检查报告

根据考试需求文档 `exam-v4-v2-async-event-driven-observability.md`，对远程部署地址 `https://qiancheng0605v1.vercel.app/` 及源码进行逐项合规检查。

### 核心发现

**前置红线：全部通过（6/6）**

- 在线系统已部署、SKU 脚本存在、压测文件存在、异步架构已实现、复用规则引擎、无密钥泄漏

**8 大考点逐项结果：**

| 考点 | 总分 | 预估得分 | 状态 |
| --- | --- | --- | --- |
| 考点1：异步事件驱动架构 | 20 | 20 | 全部通过 |
| 考点2：批量处理与性能达标 | 25 | 19-25 | 压测未执行（6分待验证） |
| 考点3：幂等重试与任务恢复 | 15 | 13-15 | 重复上传策略待明确 |
| 考点4：错误精细化 | 10 | 10 | 全部通过 |
| 考点5：全链路可观测性 | 20 | 18-20 | 告警仅基础级别 |
| 考点6：容灾降级与容量规划 | 5 | 5 | 全部通过 |
| 考点7：提交质量与工程规范 | 5 | 3-5 | 测试覆盖不足 |
| **合计** | **100** | **88-100** |  |


### 不符合项（5项）

1. **压测未执行**（高优先级）：10,000 行 ≤ 60 秒未实际验证，需运行 k6 压测
2. **自动化测试覆盖不足**（中优先级）：需求要求至少 12 项测试场景，当前仅覆盖约 5 项
3. **告警能力仅基础**（低优先级）：无外部通知渠道
4. **Worker 部署状态未验证**（低优先级）：需确认 Railway/Render 上的 Worker 是否运行
5. **重复上传策略未明确**（低优先级）：文档中未专门说明

## 检查方法与工具

### 检查方式

- **源码审查**：读取所有关键文件（schema.ts、services、queue、API routes、前端页面）
- **远程验证**：确认 Vercel 部署地址可访问
- **待执行**：k6 压测脚本验证性能指标

### 已审查的关键文件

- `src/lib/db/schema.ts` — 8 张表，索引完整
- `src/lib/services/import-task.service.ts` — Transactional Outbox 实现
- `src/lib/services/batch-processor.service.ts` — 批量解析/校验/写入
- `src/lib/services/sku-validator.service.ts` — 批量 IN 查询 + 降级
- `src/lib/queue/worker.ts` — 幂等检查 + 原子进度 + 状态聚合
- `src/lib/queue/dispatcher.ts` — 轮询 + 重试 + 指数退避
- `src/lib/utils/trace.ts` — traceId/taskId 生成
- `src/lib/utils/mask.ts` — 手机号/地址脱敏
- `src/app/api/import-tasks/route.ts` — 上传即返回
- `src/app/api/import-monitor/summary/route.ts` — 监控聚合
- `src/app/api/traces/[traceId]/route.ts` — Trace 查询
- `src/app/api/traces/search/route.ts` — 多条件搜索
- `src/app/monitor/page.tsx` — 4 区域监控看板
- `src/app/import/[taskId]/page.tsx` — 进度与结果页
- `scripts/seed-data.ts` — 压测数据生成
- `scripts/load-test.js` — k6 压测脚本
- `scripts/recover-stale.ts` — 卡死恢复
- `tests/import-task.test.ts` — 单元测试
- `docs/REFACTOR_ASSUMPTIONS.md` — 重构假设说明（12 项完整）
- `README.md` — 内容完整

## Agent Extensions

### Skill

- **playwright-cli**
- Purpose: 通过浏览器自动化访问远程部署地址 `https://qiancheng0605v1.vercel.app/`，验证前端页面功能完整性
- Expected outcome: 确认首页、导入页、监控看板、Trace 检索页均可正常访问和加载
- **xlsx**
- Purpose: 验证 `test-data/10000-orders.xlsx` 压测文件的行数、SKU 分布、非法数据插入是否符合需求
- Expected outcome: 确认文件包含 10,000 行运单数据，且含有非法 SKU 用于错误定位验证