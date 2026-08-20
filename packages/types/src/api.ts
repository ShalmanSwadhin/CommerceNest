/**
 * CommerceNest API error response shape.
 * All API routes should return errors in this format for consistent client handling.
 */

export interface ApiErrorDetail {
  field?: string;
  message: string;
  code?: string;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: ApiErrorDetail[] | Record<string, unknown>;
}

export interface ApiErrorResponse {
  error: ApiErrorBody;
}

/** Standard error codes used across CommerceNest APIs */
export const ApiErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  TENANT_MISMATCH: 'TENANT_MISMATCH',
  STORE_SUSPENDED: 'STORE_SUSPENDED',
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  PAYMENT_VERIFICATION_FAILED: 'PAYMENT_VERIFICATION_FAILED',
  SMS_UNAVAILABLE: 'SMS_UNAVAILABLE',
  EMAIL_UNAVAILABLE: 'EMAIL_UNAVAILABLE',
  PRODUCT_LIMIT_REACHED: 'PRODUCT_LIMIT_REACHED',
  STAFF_LIMIT_REACHED: 'STAFF_LIMIT_REACHED',
  STORAGE_LIMIT_REACHED: 'STORAGE_LIMIT_REACHED',
  STORAGE_VERIFICATION_UNAVAILABLE: 'STORAGE_VERIFICATION_UNAVAILABLE',
  DUPLICATE_PAYMENT_REFERENCE: 'DUPLICATE_PAYMENT_REFERENCE',
  PAYMENT_ALREADY_VERIFIED: 'PAYMENT_ALREADY_VERIFIED',
  INVOICE_ALREADY_PAID: 'INVOICE_ALREADY_PAID',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

export function createApiError(
  code: ApiErrorCode | string,
  message: string,
  details?: ApiErrorBody['details'],
): ApiErrorResponse {
  const body: ApiErrorBody = { code, message };
  if (details !== undefined) {
    body.details = details;
  }
  return { error: body };
}

export function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.error !== 'object' || obj.error === null) return false;
  const err = obj.error as Record<string, unknown>;
  return typeof err.code === 'string' && typeof err.message === 'string';
}
