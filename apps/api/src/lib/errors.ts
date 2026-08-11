import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import {
  ApiErrorCode,
  createApiError,
  type ApiErrorBody,
} from '@commercenest/types';
import { logger } from './logger.js';

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: ApiErrorBody['details'];
  readonly isOperational: boolean;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: ApiErrorBody['details'],
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
  }

  static badRequest(message: string, details?: ApiErrorBody['details']) {
    return new AppError(400, ApiErrorCode.VALIDATION_ERROR, message, details);
  }

  static unauthorized(message = 'Authentication required') {
    return new AppError(401, ApiErrorCode.UNAUTHORIZED, message);
  }

  static forbidden(message = 'Forbidden', code: string = ApiErrorCode.FORBIDDEN) {
    return new AppError(403, code, message);
  }

  static notFound(message = 'Resource not found') {
    return new AppError(404, ApiErrorCode.NOT_FOUND, message);
  }

  static conflict(message: string, details?: ApiErrorBody['details']) {
    return new AppError(409, ApiErrorCode.CONFLICT, message, details);
  }

  static tenantMismatch(message = 'Cross-store access denied') {
    return new AppError(403, ApiErrorCode.TENANT_MISMATCH, message);
  }

  static rateLimited(message = 'Too many requests') {
    return new AppError(429, ApiErrorCode.RATE_LIMITED, message);
  }
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function isZodError(err: unknown): err is ZodError {
  if (err instanceof ZodError) return true;
  // Workspace may load multiple Zod copies — fall back to duck-typing
  if (typeof err === 'object' && err !== null) {
    const candidate = err as { name?: string; issues?: unknown };
    return candidate.name === 'ZodError' && Array.isArray(candidate.issues);
  }
  return false;
}

export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (isZodError(err)) {
    const details = err.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
      code: String(issue.code),
    }));
    res
      .status(400)
      .json(createApiError(ApiErrorCode.VALIDATION_ERROR, 'Validation failed', details));
    return;
  }

  if (err instanceof AppError) {
    res
      .status(err.statusCode)
      .json(createApiError(err.code, err.message, err.details));
    return;
  }

  logger.error({ err }, 'Unhandled error');
  res
    .status(500)
    .json(createApiError(ApiErrorCode.INTERNAL_ERROR, 'Internal server error'));
}
