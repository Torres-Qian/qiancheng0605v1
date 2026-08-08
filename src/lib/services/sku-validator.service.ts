/**
 * SKU 批量校验服务
 * 支持批量查询、降级模式
 */

import { getDb } from "../db";
import { skuMaster } from "../db/schema";
import { inArray, sql } from "drizzle-orm";

const SKU_VALIDATE_TIMEOUT_MS = 3000;
const BATCH_QUERY_LIMIT = 500;

export interface SkuValidationResult {
  validSkus: Set<string>;
  invalidSkus: Set<string>;
  degraded: boolean;
}

export async function validateSkus(
  skuCodes: string[],
  options?: { timeout?: number },
): Promise<SkuValidationResult> {
  const timeout = options?.timeout || SKU_VALIDATE_TIMEOUT_MS;
  const db = getDb();

  const validSkus = new Set<string>();
  const invalidSkus = new Set<string>();
  let degraded = false;

  const uniqueCodes = [...new Set(skuCodes.filter(Boolean))];
  if (uniqueCodes.length === 0) {
    return { validSkus, invalidSkus, degraded: false };
  }

  try {
    // 用 Promise.race 实现真正的超时保护（AbortController 对 drizzle+neon 并不总生效）
    const queryPromise = (async () => {
      for (let i = 0; i < uniqueCodes.length; i += BATCH_QUERY_LIMIT) {
        const batch = uniqueCodes.slice(i, i + BATCH_QUERY_LIMIT);
        const results = await db
          .select({ skuCode: skuMaster.skuCode })
          .from(skuMaster)
          .where(inArray(skuMaster.skuCode, batch));
        for (const row of results) {
          validSkus.add(row.skuCode);
        }
      }
    })();

    await Promise.race([
      queryPromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`SKU 校验超时 (${timeout}ms)`)), timeout),
      ),
    ]);
  } catch (err: any) {
    console.warn("[sku-validator] SKU 校验异常，进入降级模式:", err.message);
    degraded = true;
    validSkus.clear();
    // 降级：所有 SKU 都标记为有效
    for (const code of uniqueCodes) {
      validSkus.add(code);
    }
  }

  // 找出无效 SKU
  for (const code of uniqueCodes) {
    if (!validSkus.has(code) && !degraded) {
      invalidSkus.add(code);
    }
  }

  return { validSkus, invalidSkus, degraded };
}
