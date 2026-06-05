import { WaybillRecord, ValidationError } from '@/types/waybill';

export function validatePhone(phone: string): boolean {
  if (!phone || phone.trim() === '') return true;
  const mobileRegex = /^1[3-9]\d{9}$/;
  const landlineRegex = /^0\d{2,3}-?\d{7,8}$/;
  return mobileRegex.test(phone.trim()) || landlineRegex.test(phone.trim());
}

export function validatePositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

export function validateABGroup(record: WaybillRecord): boolean {
  const aGroup = record.recipientStore?.trim() || '';
  const bGroupComplete = [
    record.recipientName?.trim() || '',
    record.recipientPhone?.trim() || '',
    record.recipientAddress?.trim() || '',
  ].every(f => f !== '');
  return aGroup !== '' || bGroupComplete;
}

// 全量校验
export function validateRecords(records: WaybillRecord[]): ValidationError[] {
  const allErrors: ValidationError[] = [];

  records.forEach((record, index) => {
    const rowNum = record.rowIndex ?? index;

    if (!record.skuCode || record.skuCode.trim() === '') {
      allErrors.push({ rowIndex: rowNum, field: 'skuCode', message: 'SKU物品编码不能为空', severity: 'error' });
    }
    if (!record.skuName || record.skuName.trim() === '') {
      allErrors.push({ rowIndex: rowNum, field: 'skuName', message: 'SKU物品名称不能为空', severity: 'error' });
    }
    if (!record.skuQuantity || !validatePositiveInteger(record.skuQuantity)) {
      allErrors.push({ rowIndex: rowNum, field: 'skuQuantity', message: 'SKU发货数量必须为正整数', severity: 'error' });
    }
    if (!validateABGroup(record)) {
      allErrors.push({
        rowIndex: rowNum,
        field: 'recipientGroup',
        message: '收货门店（A组）或收件人姓名+电话+地址（B组）至少填写一组',
        severity: 'error',
      });
    }
    if (record.recipientPhone && record.recipientPhone.trim() !== '' && !validatePhone(record.recipientPhone)) {
      allErrors.push({ rowIndex: rowNum, field: 'recipientPhone', message: '电话号码格式不正确', severity: 'error' });
    }
  });

  // 外部编码同批次重复检测
  const codeMap = new Map<string, number[]>();
  records.forEach((record, index) => {
    const code = record.externalCode?.trim();
    if (code) {
      if (!codeMap.has(code)) codeMap.set(code, []);
      codeMap.get(code)!.push(record.rowIndex ?? index);
    }
  });
  codeMap.forEach((indices, code) => {
    if (indices.length > 1) {
      indices.forEach((idx, i) => {
        if (i > 0) {
          allErrors.push({
            rowIndex: idx,
            field: 'externalCode',
            message: `外部编码"${code}"与第${indices[0] + 1}行重复`,
            severity: 'error',
          });
        }
      });
    }
  });

  return allErrors;
}
