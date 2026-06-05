// 文件处理工具

export function getFileExtension(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() || '';
}

export function detectFileType(fileName: string): 'excel' | 'word' | 'pdf' | 'unknown' {
  const ext = getFileExtension(fileName);
  if (['xlsx', 'xls'].includes(ext)) return 'excel';
  if (['docx'].includes(ext)) return 'word';
  if (['pdf'].includes(ext)) return 'pdf';
  return 'unknown';
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export function validateFileType(file: File): { valid: boolean; error?: string } {
  const type = detectFileType(file.name);
  if (type === 'unknown') {
    return { valid: false, error: '不支持的文件格式，请上传 Excel(.xlsx/.xls)、Word(.docx) 或 PDF 文件' };
  }
  if (file.size > 10 * 1024 * 1024) {
    return { valid: false, error: '文件大小不能超过 10MB' };
  }
  return { valid: true };
}
