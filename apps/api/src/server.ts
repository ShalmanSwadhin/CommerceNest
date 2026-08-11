import { createApp } from './app.js';
import { env } from './lib/env.js';
import { logger } from './lib/logger.js';
import { initRedis, closeRedis } from './lib/redis.js';
import { disconnectPrisma } from './lib/prisma.js';

async function main() {
  await initRedis();
  const app = createApp();

  const server = app.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, env: env.NODE_ENV },
      'CommerceNest API listening',
    );
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      logger.fatal(
        { port: env.PORT },
        `Port ${env.PORT} is already in use. Stop the other process or run npm run dev again.`,
      );
      process.exit(1);
    }
    logger.fatal({ err }, 'HTTP server error');
    process.exit(1);
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    server.close(async () => {
      await closeRedis();
      await disconnectPrisma();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start API');
  process.exit(1);
});
