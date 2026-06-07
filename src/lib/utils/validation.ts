import { WaybillRecord, ValidationError } from '@/types/waybill';

// 电话格式校验
const PHONE_REGEX = /^1[3-9]\d{9}$/;
const LANDLINE_REGEX = /^0\d{2,3}-?\d{7,8}$/;

export function validatePhone(phone: string): boolean {
  if (!phone || phone.trim() === '') return true; // 非必填
  return PHONE_REGEX.test(phone.trim()) || LANDLINE_REGEX.test(phone.trim());
}

// 正整数校验
export function validatePositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

// A/B组二选一校验
export function validateABGroup(record: WaybillRecord): boolean {
  const aGroup = record.recipientStore?.trim() || '';
  const bGroup = [
    record.recipientName?.trim() || '',
    record.recipientPhone?.trim() || '',
    record.recipientAddress?.trim() || '',
  ];
  const bGroupComplete = bGroup.every(f => f !== '');
  return aGroup !== '' || bGroupComplete;
}

// 全量校验单条记录
export function validateRecord(record: WaybillRecord, rowIndex: number): ValidationError[] {
  const errors: ValidationError[] = [];

  // 必填字段
  if (!record.skuCode || record.skuCode.trim() === '') {
    errors.push({ rowIndex, field: 'skuCode', message: 'SKU物品编码不能为空', severity: 'error' });
  }
  if (!record.skuName || record.skuName.trim() === '') {
    errors.push({ rowIndex, field: 'skuName', message: 'SKU物品名称不能为空', severity: 'error' });
  }
  if (!record.skuQuantity || !validatePositiveInteger(record.skuQuantity)) {
    errors.push({ rowIndex, field: 'skuQuantity', message: 'SKU发货数量必须为正整数', severity: 'error' });
  }

  // A/B组校验
  if (!validateABGroup(record)) {
    errors.push({
      rowIndex,
      field: 'recipientGroup',
      message: '收货门店（A组）或收件人姓名+电话+地址（B组）至少填写一组',
      severity: 'error',
    });
  }

  // 电话格式
  if (record.recipientPhone && record.recipientPhone.trim() !== '' && !validatePhone(record.recipientPhone)) {
    errors.push({ rowIndex, field: 'recipientPhone', message: '电话号码格式不正确', severity: 'error' });
  }

  return errors;
}

// 全量校验所有记录
export function validateAllRecords(records: WaybillRecord[]): ValidationError[] {
  const allErrors: ValidationError[] = [];
  records.forEach((record, index) => {
    const errors = validateRecord(record, record.rowIndex ?? index);
    allErrors.push(...errors);
  });

  return allErrors;
}
