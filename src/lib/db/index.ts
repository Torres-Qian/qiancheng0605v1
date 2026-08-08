import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

/**
 * 创建支持事务的数据库连接
 * 使用 neon-serverless Pool 驱动（neon-http 驱动不支持事务）
 */
function createDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL 环境变量未设置");
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return drizzle(pool, { schema });
}

// Lazy initialization - 只在运行时调用
export function getDb() {
  if (!dbInstance) {
    dbInstance = createDb();
  }
  return dbInstance;
}

// 使用 Proxy 来拦截调用
const dbProxy = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop) {
    const db = getDb();
    return (db as any)[prop];
  },
});

export const db = dbProxy;
