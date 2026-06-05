// AI Prompt 模板

export function buildFilePreviewForAI(rawData: any): string {
  const lines: string[] = [];

  // Excel格式
  if (rawData.rows && rawData.rows.length > 0) {
    // 前30行
    const previewRows = rawData.rows.slice(0, 30);
    lines.push('=== 文件前30行预览 ===');
    previewRows.forEach((row: string[], i: number) => {
      lines.push(`行${i + 1}: ${row.map((c: string) => `"${c}"`).join(' | ')}`);
    });

    // 尾部10行
    if (rawData.rows.length > 30) {
      lines.push('');
      lines.push('=== 文件尾部预览 ===');
      const tailRows = rawData.rows.slice(-10);
      tailRows.forEach((row: string[], i: number) => {
        const actualRow = rawData.rows.length - 10 + i + 1;
        lines.push(`行${actualRow}: ${row.map((c: string) => `"${c}"`).join(' | ')}`);
      });
    }
  }

  // 元信息
  lines.push('');
  lines.push(`总行数: ${rawData.metadata?.totalRows || rawData.rows?.length || 0}`);
  lines.push(`总列数: ${rawData.metadata?.totalCols || rawData.rows?.[0]?.length || 0}`);
  lines.push(`Sheet数: ${rawData.metadata?.sheetCount || 1}`);

  return lines.join('\n');
}

export function buildSystemPrompt(): string {
  return `你是一个文件解析规则生成专家。你的任务是根据文件内容的结构，生成一套JSON格式的解析规则配置。`;
}
