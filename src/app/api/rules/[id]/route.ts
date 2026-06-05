// 规则详情 + 更新 + 删除
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { parseRules } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const rules = await db.select().from(parseRules).where(eq(parseRules.id, id));
    if (rules.length === 0) {
      return NextResponse.json({ success: false, error: '规则不存在' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: rules[0] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const rules = await db.update(parseRules)
      .set({
        name: body.name,
        description: body.description,
        fileType: body.fileType,
        ruleConfig: body.ruleConfig,
        updatedAt: new Date(),
      })
      .where(eq(parseRules.id, id))
      .returning();
    return NextResponse.json({ success: true, data: rules[0] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db.delete(parseRules).where(eq(parseRules.id, id));
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
