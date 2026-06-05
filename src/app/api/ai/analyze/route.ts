// AI 分析文件并生成解析规则
import { NextRequest, NextResponse } from 'next/server';
import { analyzeFileAndGenerateRule } from '@/lib/ai/client';
import { buildFilePreviewForAI } from '@/lib/ai/prompts';
import { readFileFromBuffer } from '@/lib/engine';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: '未提供文件' }, { status: 400 });
    }

    // 服务端读取：将 File 转为 ArrayBuffer，避免使用 FileReader
    const arrayBuffer = await file.arrayBuffer();
    const rawData = await readFileFromBuffer(arrayBuffer, file.name);
    const filePreview = buildFilePreviewForAI(rawData);
    const fileType = file.name.split('.').pop()?.toLowerCase() || '';

    // 调用AI分析
    const result = await analyzeFileAndGenerateRule(filePreview, file.name, fileType);

    return NextResponse.json({
      success: true,
      data: {
        analysis: result.analysis,
        suggestedRule: result.suggestedRule,
        confidence: result.confidence,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
