/**
 * 敏感数据脱敏工具
 * 对手机号、地址等敏感字段进行脱敏处理
 */

export function maskPhone(phone: string): string {
  if (!phone || phone.length < 7) return "***";
  return phone.substring(0, 3) + "****" + phone.substring(phone.length - 4);
}

export function maskAddress(address: string): string {
  if (!address || address.length <= 6) return "***";
  const visible = address.substring(0, 6);
  return visible + "****";
}

export function maskValue(value: string, fieldName: string): string {
  const sensitiveFields = ["recipient_phone", "recipientPhone", "phone", "recipient_address", "recipientAddress", "address"];
  if (sensitiveFields.some((f) => fieldName.toLowerCase().includes(f.toLowerCase()))) {
    if (fieldName.toLowerCase().includes("phone")) return maskPhone(value);
    if (fieldName.toLowerCase().includes("address")) return maskAddress(value);
  }
  return value;
}
