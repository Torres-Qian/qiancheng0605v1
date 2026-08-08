/**
 * 批处理编排服务
 * 编排解析、SKU 校验、行级错误记录、批量写入的完整流程
 */

import { readFileFromBuffer } from "../engine";
import { mapFields, extractFromTail } from "../engine/mappers/column-mapper";
import { skipRows, skipPatternRows } from "../engine/preprocessors/skip-rows";
import { aggregateRecords } from "../engine/transformers/aggregator";
import { splitCell } from "../engine/transformers/cell-splitter";
import { transposeMatrixWithMapping } from "../engine/transformers/matrix-transposer";
import { validateRecords } from "../engine/validators";
import { validateSkus } from "./sku-validator.service";
import { getDb } from "../db";
import { waybills, importTasks, importTaskErrors, traceEvents } from "../db/schema";
import { eq, sql } from "drizzle-orm";
import { RuleConfig } from "@/types/rule";
import { WaybillRecord, ValidationError } from "@/types/waybill";
import { BatchProcessParams, BatchProcessResult } from "@/types/import-task";
import { maskValue } from "../utils/mask";
import { generateUnitId } from "../utils/trace";
import * as XLSX from "xlsx";
import * as fs from "fs";

const DB_BATCH_SIZE = 500;

export async function processBatch(params: BatchProcessParams): Promise<BatchProcessResult> {
  const { taskId, unitId, batchIndex, startRow, endRow, filePath, parseRuleId, traceId } = params;
  const db = getDb();

  // 获取解析规则
  const rules = await db.query.parseRules.findFirst({
    where: (r, { eq }) => eq(r.id, parseRuleId),
  });

  if (!rules) {
    throw new Error(`解析规则不存在: ${parseRuleId}`);
  }

  const ruleConfig = rules.ruleConfig as unknown as RuleConfig;

  // 阶段 1: 解析文件
  const parseStart = Date.now();
  let records: WaybillRecord[] = [];

  try {
    let fileBuffer: Buffer;
    let fileName: string;

    if (filePath.startsWith("db://")) {
      // 从数据库读取（Vercel Serverless 兼容）
      const taskRecord = await db
        .select({ fileName: importTasks.fileName, fileData: importTasks.fileData })
        .from(importTasks)
        .where(eq(importTasks.id, taskId))
        .limit(1);
      if (!taskRecord[0]?.fileData) {
        throw new Error(`任务文件数据不存在: ${taskId}`);
      }
      // fileData 可能是 Buffer 或 base64 string（向后兼容）
      const raw = taskRecord[0].fileData;
      if (Buffer.isBuffer(raw)) {
        fileBuffer = raw;
      } else if (typeof raw === 'string') {
        fileBuffer = Buffer.from(raw, "base64");
      } else {
        fileBuffer = Buffer.from(String(raw), "base64");
      }
      fileName = taskRecord[0].fileName;
    } else {
      // 从磁盘读取（本地开发）
      fileBuffer = fs.readFileSync(filePath);
      fileName = filePath.split("/").pop() || filePath.split("\\").pop() || "unknown";
    }

    const rawData = await readFileFromBuffer(fileBuffer.buffer as ArrayBuffer, fileName);

    // 应用规则引擎解析
    if (ruleConfig.matrixTransform?.enabled) {
      const headerRowIndex = Math.max(0, ruleConfig.headerRow - 1 - ruleConfig.skipRows.top);
      records = transposeMatrixWithMapping(
        rawData,
        ruleConfig.matrixTransform,
        ruleConfig.fieldMapping,
        headerRowIndex,
      );
    } else {
      let processed = skipRows(rawData, ruleConfig.skipRows.top, ruleConfig.skipRows.bottom);
      processed = skipPatternRows(processed.data, ruleConfig.skipRowsPattern);
      const dataRows = processed.data.rows;
      const headerRowIndex = Math.max(0, ruleConfig.headerRow - 1 - ruleConfig.skipRows.top);
      const headers = headerRowIndex >= 0 && headerRowIndex < dataRows.length ? dataRows[headerRowIndex] : [];
      const tailText = dataRows.map((r: string[]) => r.join(" ")).join("\n");

      // 数据起始偏移 = 表头行下一行，让 startRow/endRow 对应「数据行 0-based 序号」
      const dataOffset = headerRowIndex + 1;

      let rowIdx = 0;
      for (let i = startRow + dataOffset; i <= endRow + dataOffset && i < dataRows.length; i++) {
        // 双保险：始终跳过表头行本身
        if (i <= headerRowIndex) continue;
        const row = dataRows[i];
        if (row.every((c: string) => !c)) continue;

        const mapped = mapFields(row, headers, ruleConfig.fieldMapping, tailText, ruleConfig.defaultValues);
        if (!mapped.skuCode && !mapped.skuName && !mapped.skuQuantity) continue;

        records.push({
          externalCode: mapped.externalCode || "",
          recipientStore: mapped.recipientStore || "",
          recipientName: mapped.recipientName || "",
          recipientPhone: mapped.recipientPhone || "",
          recipientAddress: mapped.recipientAddress || "",
          skuCode: mapped.skuCode || "",
          skuName: mapped.skuName || "",
          skuQuantity: parseInt(mapped.skuQuantity, 10) || 0,
          skuSpec: mapped.skuSpec || "",
          remark: mapped.remark || "",
          rowIndex: rowIdx++,
        });
      }
    }

    // 聚合和拆分
    if (ruleConfig.aggregation.enabled) {
      records = aggregateRecords(records, ruleConfig.aggregation);
    }
    if (ruleConfig.cellSplitConfig?.enabled) {
      records = splitCell(records, ruleConfig.cellSplitConfig);
    }
  } catch (err: any) {
    throw new Error(`文件解析失败: ${err.message}`);
  }

  const parseEnd = Date.now();
  const parseDurationMs = parseEnd - parseStart;

  // 阶段 2: 规则引擎字段映射/转换（已在解析阶段完成）
  const ruleDurationMs = 0;

  // 阶段 3: SKU 批量校验
  const validateStart = Date.now();
  const skuCodes = records.map((r) => r.skuCode).filter(Boolean);
  const skuResult = await validateSkus(skuCodes);
  const validateEnd = Date.now();
  const validateDurationMs = validateEnd - validateStart;

  // 如果降级，更新任务状态
  if (skuResult.degraded) {
    await db
      .update(importTasks)
      .set({ degraded: true, degradedReason: "SKU 主数据校验超时，已降级为本地格式校验" })
      .where(eq(importTasks.id, taskId));

    await db.insert(traceEvents).values({
      traceId,
      taskId,
      unitId,
      eventName: "ImportTaskDegraded",
      eventStatus: "WARNING",
      message: "SKU 校验降级",
    });
  }

  // 阶段 4: 逐行校验 + 错误记录
  const errors: { rowIndex: number; fieldName: string; rawValue: string; errorCode: string; errorReason: string }[] = [];
  const successRecords: WaybillRecord[] = [];

  for (const record of records) {
    const rowErrors: typeof errors = [];

    // SKU 校验
    if (record.skuCode && !skuResult.validSkus.has(record.skuCode) && !skuResult.degraded) {
      rowErrors.push({
        rowIndex: startRow + (record.rowIndex || 0),
        fieldName: "sku_code",
        rawValue: record.skuCode,
        errorCode: "E001",
        errorReason: `SKU ${record.skuCode} 在商品主数据中不存在`,
      });
    }

    // 必填校验
    if (!record.skuCode) {
      rowErrors.push({
        rowIndex: startRow + (record.rowIndex || 0),
        fieldName: "sku_code",
        rawValue: "",
        errorCode: "E002",
        errorReason: "SKU编码为必填字段",
      });
    }
    if (!record.skuName) {
      rowErrors.push({
        rowIndex: startRow + (record.rowIndex || 0),
        fieldName: "sku_name",
        rawValue: "",
        errorCode: "E002",
        errorReason: "SKU名称为必填字段",
      });
    }

    // 电话格式校验
    if (record.recipientPhone && !/^1[3-9]\d{9}$/.test(record.recipientPhone)) {
      rowErrors.push({
        rowIndex: startRow + (record.rowIndex || 0),
        fieldName: "recipient_phone",
        rawValue: maskValue(record.recipientPhone, "recipient_phone"),
        errorCode: "E003",
        errorReason: `电话号码格式不正确: ${maskValue(record.recipientPhone, "recipient_phone")}`,
      });
    }

    // 数量正数校验
    if (record.skuQuantity <= 0) {
      rowErrors.push({
        rowIndex: startRow + (record.rowIndex || 0),
        fieldName: "sku_quantity",
        rawValue: String(record.skuQuantity),
        errorCode: "E004",
        errorReason: "SKU数量必须为正数",
      });
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
    } else {
      successRecords.push(record);
    }
  }

  // 批量写入错误明细
  if (errors.length > 0) {
    const errorValues = errors.map((e) => ({
      taskId,
      batchIndex,
      unitId,
      rowNumber: e.rowIndex,
      fieldName: e.fieldName,
      rawValue: e.rawValue,
      errorCode: e.errorCode,
      errorReason: e.errorReason,
      traceId,
    }));

    for (let i = 0; i < errorValues.length; i += DB_BATCH_SIZE) {
      const batch = errorValues.slice(i, i + DB_BATCH_SIZE);
      await db.insert(importTaskErrors).values(batch);
    }
  }

  // 阶段 5: 批量 UPSERT
  const insertStart = Date.now();

  if (successRecords.length > 0) {
    const waybillValues = successRecords.map((r) => ({
      externalCode: r.externalCode,
      externalOrderNo: r.externalCode,
      lineNo: r.rowIndex != null ? r.rowIndex + 1 : undefined,
      recipientStore: r.recipientStore,
      recipientName: r.recipientName,
      recipientPhone: r.recipientPhone,
      recipientAddress: r.recipientAddress,
      skuCode: r.skuCode,
      skuName: r.skuName,
      skuQuantity: r.skuQuantity,
      skuSpec: r.skuSpec,
      remark: r.remark,
      batchId: taskId,
      sourceFile: filePath.split("/").pop() || filePath.split("\\").pop(),
      parseRuleId,
      taskId,
      status: "imported" as const,
    }));

    for (let i = 0; i < waybillValues.length; i += DB_BATCH_SIZE) {
      const batch = waybillValues.slice(i, i + DB_BATCH_SIZE);
      await db
        .insert(waybills)
        .values(batch)
        .onConflictDoUpdate({
          target: [waybills.externalOrderNo, waybills.skuCode, waybills.lineNo],
          set: {
            skuName: sql`EXCLUDED.sku_name`,
            skuQuantity: sql`EXCLUDED.sku_quantity`,
            skuSpec: sql`EXCLUDED.sku_spec`,
            recipientStore: sql`EXCLUDED.recipient_store`,
            recipientName: sql`EXCLUDED.recipient_name`,
            recipientPhone: sql`EXCLUDED.recipient_phone`,
            recipientAddress: sql`EXCLUDED.recipient_address`,
            updatedAt: sql`NOW()`,
          },
        });
    }
  }

  const insertEnd = Date.now();
  const insertDurationMs = insertEnd - insertStart;

  // 从 rawData 获取实际总行数（用于修正上传时的估算值）
  let actualTotalRows = 0;
  try {
    const rawData = await readFileFromBuffer(fileBuffer.buffer as ArrayBuffer, fileName);
    actualTotalRows = rawData.rows.length - (ruleConfig.headerRow || 1) - (ruleConfig.skipRows?.bottom || 0);
  } catch {
    actualTotalRows = successRecords.length + errors.length;
  }

  return {
    successCount: successRecords.length,
    failedCount: errors.length,
    parseDurationMs,
    ruleDurationMs,
    validateDurationMs,
    insertDurationMs,
    actualRowCount: Math.max(1, actualTotalRows),
  };
}
