import { Redis as RedisClient } from 'ioredis';
import { env } from './env.js';
import { logger } from './logger.js';

type MemoryEntry = { value: string; expiresAt?: number };

const memoryStore = new Map<string, MemoryEntry>();

let redis: RedisClient | null = null;
let useMemory = true;

export function isRedisAvailable() {
  return !useMemory && redis !== null;
}

async function discardClient(client: RedisClient | null) {
  if (!client) return;
  try {
    client.removeAllListeners();
    client.disconnect();
  } catch {
    /* ignore */
  }
}

export async function initRedis() {
  if (!env.REDIS_URL) {
    logger.warn('REDIS_URL not set — using in-memory session store');
    useMemory = true;
    return;
  }

  let client: RedisClient | null = null;
  try {
    client = new RedisClient(env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: true,
      retryStrategy: () => null,
      reconnectOnError: () => false,
    });
    // Swallow async connect errors so they never become unhandled.
    client.on('error', () => undefined);

    await Promise.race([
      client.connect(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Redis connect timeout')), 1500),
      ),
    ]);
    await client.ping();
    redis = client;
    useMemory = false;
    client.on('error', (err: Error) => {
      logger.warn({ err }, 'Redis error — falling back to memory store');
      useMemory = true;
    });
    logger.info('Connected to Redis');
  } catch {
    logger.warn('Redis unavailable — using in-memory session store');
    useMemory = true;
    await discardClient(client);
    redis = null;
  }
}

function purgeExpired(key: string) {
  const entry = memoryStore.get(key);
  if (!entry) return;
  if (entry.expiresAt && entry.expiresAt <= Date.now()) {
    memoryStore.delete(key);
  }
}

export async function kvGet(key: string): Promise<string | null> {
  if (!useMemory && redis) {
    try {
      return await redis.get(key);
    } catch {
      useMemory = true;
    }
  }
  purgeExpired(key);
  return memoryStore.get(key)?.value ?? null;
}

export async function kvSet(
  key: string,
  value: string,
  ttlSeconds?: number,
): Promise<void> {
  if (!useMemory && redis) {
    try {
      if (ttlSeconds && ttlSeconds > 0) {
        await redis.set(key, value, 'EX', ttlSeconds);
      } else {
        await redis.set(key, value);
      }
      return;
    } catch {
      useMemory = true;
    }
  }
  memoryStore.set(key, {
    value,
    expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
  });
}

export async function kvDel(key: string): Promise<void> {
  if (!useMemory && redis) {
    try {
      await redis.del(key);
      return;
    } catch {
      useMemory = true;
    }
  }
  memoryStore.delete(key);
}

export async function kvIncr(key: string, ttlSeconds?: number): Promise<number> {
  if (!useMemory && redis) {
    try {
      const count = await redis.incr(key);
      if (count === 1 && ttlSeconds) {
        await redis.expire(key, ttlSeconds);
      }
      return count;
    } catch {
      useMemory = true;
    }
  }
  purgeExpired(key);
  const current = Number(memoryStore.get(key)?.value ?? '0') + 1;
  memoryStore.set(key, {
    value: String(current),
    expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
  });
  return current;
}

export async function closeRedis() {
  if (redis) {
    await discardClient(redis);
    redis = null;
  }
}
