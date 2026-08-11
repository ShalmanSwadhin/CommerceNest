import type { NextFunction, Request, Response } from 'express';
import { kvIncr } from '../lib/redis.js';
import { AppError } from '../lib/errors.js';

export function rateLimit(options: {
  windowSeconds: number;
  max: number;
  keyPrefix: string;
  keyFn?: (req: Request) => string;
}) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const identity =
        options.keyFn?.(req) ??
        req.ip ??
        req.socket.remoteAddress ??
        'unknown';
      const key = `${options.keyPrefix}:${identity}`;
      const count = await kvIncr(key, options.windowSeconds);
      if (count > options.max) {
        next(AppError.rateLimited());
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
