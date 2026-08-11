import jwt from 'jsonwebtoken';
import type { UserRole } from '@commercenest/types';
import { env } from './env.js';
import { AppError } from './errors.js';

export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
  storeId: string | null;
  type: 'access';
  impersonationSessionId?: string;
}

export interface CustomerTokenPayload {
  sub: string;
  storeId: string;
  typ: 'customer';
  /** Optional alias some clients may send */
  role?: 'CUSTOMER';
}

export interface RefreshTokenPayload {
  sub: string;
  type: 'refresh';
  jti: string;
}

export function signAccessToken(
  payload: Omit<AccessTokenPayload, 'type'>,
): string {
  return jwt.sign(
    { ...payload, type: 'access' satisfies AccessTokenPayload['type'] },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'] },
  );
}

/** Short-lived storefront customer JWT */
export function signCustomerToken(
  payload: Omit<CustomerTokenPayload, 'typ'>,
): string {
  return jwt.sign(
    {
      sub: payload.sub,
      storeId: payload.storeId,
      typ: 'customer' satisfies CustomerTokenPayload['typ'],
      role: 'CUSTOMER' as const,
    },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '2h' },
  );
}

export function signRefreshToken(
  payload: Omit<RefreshTokenPayload, 'type'>,
): string {
  return jwt.sign(
    { ...payload, type: 'refresh' satisfies RefreshTokenPayload['type'] },
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_TTL as jwt.SignOptions['expiresIn'] },
  );
}

export function isCustomerTokenPayload(
  payload: unknown,
): payload is CustomerTokenPayload {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  return p.typ === 'customer' || p.role === 'CUSTOMER';
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as
      | AccessTokenPayload
      | CustomerTokenPayload;
    if (isCustomerTokenPayload(payload)) {
      throw AppError.unauthorized('Customer token is not a staff access token');
    }
    if (payload.type !== 'access') {
      throw AppError.unauthorized('Invalid access token');
    }
    return payload;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw AppError.unauthorized('Invalid or expired access token');
  }
}

export function verifyCustomerToken(token: string): CustomerTokenPayload {
  try {
    const payload = jwt.verify(
      token,
      env.JWT_ACCESS_SECRET,
    ) as CustomerTokenPayload;
    if (!isCustomerTokenPayload(payload)) {
      throw AppError.unauthorized('Invalid customer token');
    }
    if (!payload.sub || !payload.storeId) {
      throw AppError.unauthorized('Invalid customer token claims');
    }
    return payload;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw AppError.unauthorized('Invalid or expired customer token');
  }
}

/** Decode staff or customer access token from the shared access secret */
export function verifyAnyAccessToken(
  token: string,
): AccessTokenPayload | CustomerTokenPayload {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as
      | AccessTokenPayload
      | CustomerTokenPayload;
    if (isCustomerTokenPayload(payload)) {
      if (!payload.sub || !payload.storeId) {
        throw AppError.unauthorized('Invalid customer token claims');
      }
      return payload;
    }
    if ((payload as AccessTokenPayload).type !== 'access') {
      throw AppError.unauthorized('Invalid access token');
    }
    return payload as AccessTokenPayload;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw AppError.unauthorized('Invalid or expired access token');
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const payload = jwt.verify(
      token,
      env.JWT_REFRESH_SECRET,
    ) as RefreshTokenPayload;
    if (payload.type !== 'refresh') {
      throw AppError.unauthorized('Invalid refresh token');
    }
    return payload;
  } catch {
    throw AppError.unauthorized('Invalid or expired refresh token');
  }
}
