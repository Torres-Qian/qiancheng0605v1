// 规则列表 + 创建
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { parseRules } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

// GET - 获取所有规则
export async function GET() {
  try {
    const rules = await db.select().from(parseRules).orderBy(desc(parseRules.updatedAt));
    return NextResponse.json({ success: true, data: rules });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST - 创建规则
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rule = await db.insert(parseRules).values({
      name: body.name,
      description: body.description || '',
      fileType: body.fileType,
      ruleConfig: body.ruleConfig,
      createdBy: body.createdBy || 'manual',
    }).returning();
    return NextResponse.json({ success: true, data: rule[0] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
