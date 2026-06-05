// 提交下单
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { waybills } from '@/lib/db/schema';
import { validateRecords } from '@/lib/engine/validators';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { records, batchId, sourceFile, parseRuleId } = body;

    if (!records || !Array.isArray(records) || records.length === 0) {
      return NextResponse.json({ success: false, error: '没有可提交的数据' }, { status: 400 });
    }

    // 校验
    const errors = validateRecords(records);
    if (errors.length > 0) {
      return NextResponse.json({
        success: false,
        error: '数据校验不通过，请先修正错误',
        validationErrors: errors,
      }, { status: 400 });
    }

    // 批量插入
    let successCount = 0;
    let failedCount = 0;
    const failedRows: { row: number; message: string }[] = [];

    for (const record of records) {
      try {
        await db.insert(waybills).values({
          externalCode: record.externalCode || '',
          recipientStore: record.recipientStore || '',
          recipientName: record.recipientName || '',
          recipientPhone: record.recipientPhone || '',
          recipientAddress: record.recipientAddress || '',
          skuCode: record.skuCode,
          skuName: record.skuName,
          skuQuantity: record.skuQuantity,
          skuSpec: record.skuSpec || '',
          remark: record.remark || '',
          batchId: batchId || crypto.randomUUID(),
          sourceFile: sourceFile || '',
          parseRuleId: parseRuleId || null,
          status: 'submitted',
        });
        successCount++;
      } catch (err: any) {
        failedCount++;
        failedRows.push({ row: (record.rowIndex || 0) + 1, message: err.message });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        success: successCount,
        failed: failedCount,
        errors: failedRows,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
