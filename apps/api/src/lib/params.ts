import type { Request } from 'express';
import { AppError } from './errors.js';

/** Express 5 typings allow string | string[]; we always expect a single path param. */
export function param(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== 'string' || !value) {
    throw AppError.badRequest(`Missing path parameter: ${name}`);
  }
  return value;
}
