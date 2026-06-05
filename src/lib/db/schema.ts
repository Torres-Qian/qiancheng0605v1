import { pgTable, uuid, varchar, text, integer, jsonb, timestamp } from 'drizzle-orm/pg-core';

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
export const waybills = pgTable('waybills', {
  id: uuid('id').primaryKey().defaultRandom(),
  externalCode: varchar('external_code', { length: 255 }),
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
  status: varchar('status', { length: 20 }).default('imported'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
