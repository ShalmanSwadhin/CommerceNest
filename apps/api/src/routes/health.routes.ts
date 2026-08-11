import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { isRedisAvailable } from '../lib/redis.js';

export const healthRouter = Router();

healthRouter.get('/health', async (_req, res) => {
  let database: 'up' | 'down' | 'unconfigured' = 'unconfigured';
  if (process.env.DATABASE_URL) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      database = 'up';
    } catch {
      database = 'down';
    }
  }

  res.json({
    ok: true,
    service: 'commercenest-api',
    brand: 'CommerceNest',
    timestamp: new Date().toISOString(),
    database,
    redis: isRedisAvailable() ? 'up' : 'memory-fallback',
  });
});
