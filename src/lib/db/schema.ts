import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
  boolean,
  bigint,
} from 'drizzle-orm/pg-core';

// ==================== 复用表 ====================

// 解析规则表
export const parseRules = pgTable('parse_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  fileType: varchar('file_type', { length: 50 }).notNull(),
  ruleConfig: jsonb('rule_config').notNull(),
  createdBy: varchar('created_by', { length: 50 }).default('manual'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 运单表
export const waybills = pgTable(
  'waybills',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    externalCode: varchar('external_code', { length: 255 }),
    externalOrderNo: varchar('external_order_no', { length: 255 }),
    lineNo: integer('line_no'),
    recipientStore: varchar('recipient_store', { length: 255 }),
    recipientName: varchar('recipient_name', { length: 255 }),
    recipientPhone: varchar('recipient_phone', { length: 50 }),
    recipientAddress: text('recipient_address'),
    skuCode: varchar('sku_code', { length: 255 }).notNull(),
    skuName: varchar('sku_name', { length: 255 }).notNull(),
    skuQuantity: integer('sku_quantity').notNull(),
    skuSpec: varchar('sku_spec', { length: 255 }),
    remark: text('remark'),
    batchId: uuid('batch_id').notNull(),
    sourceFile: varchar('source_file', { length: 255 }),
    parseRuleId: uuid('parse_rule_id').references(() => parseRules.id),
    taskId: uuid('task_id'),
    status: varchar('status', { length: 20 }).default('imported'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => [
    index('waybills_task_id_idx').on(table.taskId),
    uniqueIndex('waybills_dedup_idx').on(table.externalOrderNo, table.skuCode, table.lineNo),
  ],
);

// ==================== 新增表 ====================

// SKU 主数据表
export const skuMaster = pgTable(
  'sku_master',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    skuCode: varchar('sku_code', { length: 255 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    spec: varchar('spec', { length: 255 }),
    unit: varchar('unit', { length: 50 }),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [uniqueIndex('sku_master_code_unique').on(table.skuCode)],
);

// 导入任务主表
export const importTasks = pgTable(
  'import_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fileName: varchar('file_name', { length: 500 }).notNull(),
    filePath: text('file_path'),
    fileData: text('file_data'),
    parseRuleId: uuid('parse_rule_id').references(() => parseRules.id),
    status: varchar('status', { length: 20 }).notNull().default('PENDING'),
    totalRows: integer('total_rows').notNull().default(0),
    processedRows: integer('processed_rows').notNull().default(0),
    successRows: integer('success_rows').notNull().default(0),
    failedRows: integer('failed_rows').notNull().default(0),
    totalBatches: integer('total_batches').notNull().default(0),
    completedBatches: integer('completed_batches').notNull().default(0),
    traceId: varchar('trace_id', { length: 100 }).notNull(),
    degraded: boolean('degraded').notNull().default(false),
    degradedReason: text('degraded_reason'),
    createdAt: timestamp('created_at').defaultNow(),
    completedAt: timestamp('completed_at'),
  },
  (table) => [
    index('import_tasks_status_idx').on(table.status),
    index('import_tasks_created_at_idx').on(table.createdAt),
    index('import_tasks_trace_id_idx').on(table.traceId),
  ],
);

// 处理单元状态表（批次/分片）
export const importTaskBatches = pgTable(
  'import_task_batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => importTasks.id, { onDelete: 'cascade' }),
    unitId: varchar('unit_id', { length: 100 }).notNull(),
    batchIndex: integer('batch_index').notNull(),
    startRow: integer('start_row').notNull(),
    endRow: integer('end_row').notNull(),
    status: varchar('status', { length: 20 }).notNull().default('PENDING'),
    retryCount: integer('retry_count').notNull().default(0),
    lockedAt: timestamp('locked_at'),
    completedAt: timestamp('completed_at'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [
    uniqueIndex('batches_task_unit_unique').on(table.taskId, table.unitId),
    index('batches_task_id_idx').on(table.taskId),
  ],
);

// 行级错误明细表
export const importTaskErrors = pgTable(
  'import_task_errors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => importTasks.id, { onDelete: 'cascade' }),
    batchIndex: integer('batch_index').notNull(),
    unitId: varchar('unit_id', { length: 100 }),
    rowNumber: integer('row_number').notNull(),
    fieldName: varchar('field_name', { length: 255 }),
    rawValue: text('raw_value'),
    errorCode: varchar('error_code', { length: 10 }).notNull(),
    errorReason: text('error_reason').notNull(),
    traceId: varchar('trace_id', { length: 100 }),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [
    index('errors_task_id_idx').on(table.taskId),
    index('errors_task_unit_idx').on(table.taskId, table.unitId),
    index('errors_error_code_idx').on(table.errorCode),
  ],
);

// 本地可靠事件表（Outbox）
export const eventOutbox = pgTable(
  'event_outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    aggregateId: varchar('aggregate_id', { length: 100 }).notNull(),
    eventType: varchar('event_type', { length: 100 }).notNull(),
    payload: jsonb('payload').notNull(),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    retryCount: integer('retry_count').notNull().default(0),
    nextRetryAt: timestamp('next_retry_at'),
    createdAt: timestamp('created_at').defaultNow(),
    sentAt: timestamp('sent_at'),
  },
  (table) => [
    index('outbox_status_next_retry_idx').on(table.status, table.nextRetryAt),
    index('outbox_aggregate_idx').on(table.aggregateId),
  ],
);

// 处理单元性能日志表
export const batchPerformanceLog = pgTable(
  'batch_performance_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => importTasks.id, { onDelete: 'cascade' }),
    unitId: varchar('unit_id', { length: 100 }).notNull(),
    batchIndex: integer('batch_index').notNull(),
    parseDurationMs: integer('parse_duration_ms').notNull().default(0),
    ruleDurationMs: integer('rule_duration_ms').notNull().default(0),
    validateDurationMs: integer('validate_duration_ms').notNull().default(0),
    insertDurationMs: integer('insert_duration_ms').notNull().default(0),
    totalDurationMs: integer('total_duration_ms').notNull().default(0),
    rowCount: integer('row_count').notNull().default(0),
    status: varchar('status', { length: 20 }).notNull(),
    traceId: varchar('trace_id', { length: 100 }),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [
    index('perf_log_task_unit_idx').on(table.taskId, table.unitId),
  ],
);

// 链路时间线事件表
export const traceEvents = pgTable(
  'trace_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    traceId: varchar('trace_id', { length: 100 }).notNull(),
    taskId: uuid('task_id'),
    unitId: varchar('unit_id', { length: 100 }),
    eventName: varchar('event_name', { length: 100 }).notNull(),
    eventStatus: varchar('event_status', { length: 20 }).notNull().default('SUCCESS'),
    message: text('message'),
    metadata: jsonb('metadata'),
    occurredAt: timestamp('occurred_at').defaultNow(),
  },
  (table) => [
    index('trace_events_trace_id_idx').on(table.traceId, table.occurredAt),
    index('trace_events_task_id_idx').on(table.taskId),
  ],
);
