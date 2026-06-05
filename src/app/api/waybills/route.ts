// 运单列表 + 创建
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { waybills } from '@/lib/db/schema';
import { desc, eq, like, and, sql, or } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);
    const externalCode = searchParams.get('externalCode') || '';
    const recipientName = searchParams.get('recipientName') || '';
    const recipientStore = searchParams.get('recipientStore') || '';
    const skuCode = searchParams.get('skuCode') || '';
    const skuName = searchParams.get('skuName') || '';
    const dateFrom = searchParams.get('dateFrom') || '';
    const dateTo = searchParams.get('dateTo') || '';

    const conditions = [];
    if (externalCode) conditions.push(like(waybills.externalCode, `%${externalCode}%`));
    if (recipientName) conditions.push(like(waybills.recipientName, `%${recipientName}%`));
    if (recipientStore) conditions.push(like(waybills.recipientStore, `%${recipientStore}%`));
    if (skuCode) conditions.push(like(waybills.skuCode, `%${skuCode}%`));
    if (skuName) conditions.push(like(waybills.skuName, `%${skuName}%`));
    if (dateFrom) conditions.push(sql`${waybills.createdAt} >= ${dateFrom}`);
    if (dateTo) conditions.push(sql`${waybills.createdAt} <= ${dateTo}::date + interval '1 day'`);

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [records, countResult] = await Promise.all([
      db.select()
        .from(waybills)
        .where(whereClause)
        .orderBy(desc(waybills.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db.select({ count: sql<number>`count(*)` }).from(waybills).where(whereClause),
    ]);

    return NextResponse.json({
      success: true,
      data: records,
      pagination: {
        page,
        pageSize,
        total: countResult[0]?.count || 0,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
