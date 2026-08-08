/**
 * BullMQ 队列连接管理
 * 使用 Upstash Redis 作为消息队列后端
 * 环境变量: REDIS_URL (Upstash Redis 连接串)
 */

import { Queue, QueueOptions } from "bullmq";
import { Redis } from "ioredis";

let redisClient: Redis | null = null;
let importQueue: Queue | null = null;

export function getRedisConnection(): Redis {
  if (!process.env.REDIS_URL) {
    throw new Error("REDIS_URL 环境变量未设置");
  }

  if (!redisClient) {
    const url = new URL(process.env.REDIS_URL);
    redisClient = new Redis({
      host: url.hostname,
      port: Number(url.port) || 6379,
      password: url.password || undefined,
      tls: url.protocol === "rediss:" ? {} : undefined,
      maxRetriesPerRequest: null,
      retryStrategy(times) {
        if (times > 5) return null;
        return Math.min(times * 200, 2000);
      },
      reconnectOnError(err) {
        const targetError = "READONLY";
        if (err.message.includes(targetError)) return true;
        return false;
      },
    });
  }

  return redisClient;
}

export function getImportQueue(): Queue {
  if (!importQueue) {
    const connection = getRedisConnection();
    importQueue = new Queue("import-batch", {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    });
  }
  return importQueue;
}

export async function closeQueueConnection(): Promise<void> {
  if (importQueue) {
    await importQueue.close();
    importQueue = null;
  }
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
