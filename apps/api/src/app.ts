import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import type { Request } from 'express';
import { isAllowedCorsOrigin } from './lib/env.js';
import { logger } from './lib/logger.js';
import { errorMiddleware } from './lib/errors.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { registerEventSubscribers } from './events/subscribers.js';
import { healthRouter } from './routes/health.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { adminRouter } from './routes/admin.routes.js';
import { storeRouter } from './routes/store.routes.js';
import { publicRouter } from './routes/public.routes.js';
import {
  storefrontRootRouter,
  storefrontRouter,
} from './routes/storefront.routes.js';

registerEventSubscribers();

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        if (isAllowedCorsOrigin(origin)) {
          callback(null, origin || true);
          return;
        }
        callback(null, false);
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.use(requestIdMiddleware);
  app.use(
    pinoHttp({
      logger,
      customProps: (req: Request) => ({ requestId: req.requestId }),
      // pino-http's default req/res serializers log full headers — without
      // this, every request would write the Authorization bearer token and
      // the accessToken/refreshToken cookies to stdout/log files in plain
      // text on every single hit.
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
        ],
        censor: '[redacted]',
      },
    }),
  );

  app.use('/api', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/public', publicRouter);
  app.use('/api/store/:storeId', storeRouter);
  app.use('/api/storefront', storefrontRootRouter);
  app.use('/api/storefront/:storeSlug', storefrontRouter);

  app.use((_req, res) => {
    res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    });
  });

  app.use(errorMiddleware);
  return app;
}
