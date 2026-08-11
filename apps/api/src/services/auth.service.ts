import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  acceptInviteSchema,
  staffLoginSchema,
  UserRole,
  UserStatus,
} from '@commercenest/types';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import {
  hashPassword,
  hashToken,
  verifyPassword,
  verifyTokenHash,
} from '../lib/password.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../lib/jwt.js';
import { kvDel, kvGet, kvSet } from '../lib/redis.js';
import { emitAfterCommit } from '../events/emit.js';
import { writeAuditLog } from './audit.service.js';
import { env } from '../lib/env.js';

const REFRESH_PREFIX = 'refresh:';
const RESET_PREFIX = 'pwdreset:';

const staffResetRequestSchema = z.object({
  email: z.string().trim().email(),
});

const staffResetConfirmSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(128),
});

function refreshKey(jti: string) {
  return `${REFRESH_PREFIX}${jti}`;
}

function publicUser(user: {
  id: string;
  email: string;
  name: string;
  role: string;
  storeId: string | null;
  status: string;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    storeId: user.storeId,
    status: user.status,
  };
}

async function issueTokens(
  user: {
    id: string;
    role: string;
    storeId: string | null;
  },
  opts?: { impersonationSessionId?: string },
) {
  const jti = randomUUID();
  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role as never,
    storeId: user.storeId,
    impersonationSessionId: opts?.impersonationSessionId,
  });
  const refreshToken = signRefreshToken({ sub: user.id, jti });
  // 7 days
  await kvSet(refreshKey(jti), user.id, 60 * 60 * 24 * 7);
  return { accessToken, refreshToken, jti };
}

export async function login(
  input: unknown,
  meta: { ip?: string; userAgent?: string },
) {
  const data = staffLoginSchema.parse(input);
  const user = await prisma.user.findUnique({ where: { email: data.email } });
  if (!user || !user.passwordHash) {
    throw AppError.unauthorized('Invalid email or password');
  }
  if (user.status !== UserStatus.ACTIVE) {
    throw AppError.unauthorized('Account is not active');
  }
  const ok = await verifyPassword(data.password, user.passwordHash);
  if (!ok) {
    throw AppError.unauthorized('Invalid email or password');
  }

  const tokens = await issueTokens(user);
  emitAfterCommit('UserLoggedIn', {
    storeId: user.storeId,
    actorId: user.id,
    payload: {
      userId: user.id,
      role: user.role as never,
      storeId: user.storeId,
      ipAddress: meta.ip ?? '',
      userAgent: meta.userAgent ?? '',
    },
  });

  return { user: publicUser(user), ...tokens };
}

export async function refresh(refreshToken: string) {
  const payload = verifyRefreshToken(refreshToken);
  const stored = await kvGet(refreshKey(payload.jti));
  if (!stored || stored !== payload.sub) {
    throw AppError.unauthorized('Refresh token revoked or expired');
  }
  await kvDel(refreshKey(payload.jti));

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || user.status !== UserStatus.ACTIVE) {
    throw AppError.unauthorized('User is not active');
  }
  const tokens = await issueTokens(user);
  return { user: publicUser(user), ...tokens };
}

export async function logout(refreshToken?: string) {
  if (!refreshToken) return { ok: true };
  try {
    const payload = verifyRefreshToken(refreshToken);
    await kvDel(refreshKey(payload.jti));
  } catch {
    // ignore invalid token on logout
  }
  return { ok: true };
}

export async function requestPasswordReset(input: unknown) {
  const data = staffResetRequestSchema.parse(input);
  const user = await prisma.user.findUnique({ where: { email: data.email } });
  // Always return ok to avoid enumeration
  if (!user) {
    return { ok: true, message: 'If the account exists, a reset link was sent' };
  }

  const token = randomBytes(32).toString('hex');
  await kvSet(`${RESET_PREFIX}${token}`, user.id, 60 * 60);
  // Local stub — log token in development
  return {
    ok: true,
    message: 'If the account exists, a reset link was sent',
    ...(env.NODE_ENV === 'development' ? { devToken: token } : {}),
  };
}

export async function confirmPasswordReset(input: unknown) {
  const data = staffResetConfirmSchema.parse(input);
  const userId = await kvGet(`${RESET_PREFIX}${data.token}`);
  if (!userId) {
    throw AppError.badRequest('Invalid or expired reset token');
  }
  const passwordHash = await hashPassword(data.password);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });
  await kvDel(`${RESET_PREFIX}${data.token}`);
  return { ok: true };
}

export async function acceptInvite(input: unknown) {
  const data = acceptInviteSchema.parse(input);
  const candidates = await prisma.user.findMany({
    where: {
      email: data.email,
      status: UserStatus.INVITED,
      inviteTokenHash: { not: null },
    },
  });

  let matched: (typeof candidates)[number] | null = null;
  for (const candidate of candidates) {
    if (!candidate.inviteTokenHash) continue;
    if (await verifyTokenHash(data.inviteToken, candidate.inviteTokenHash)) {
      if (
        candidate.inviteExpiresAt &&
        candidate.inviteExpiresAt.getTime() < Date.now()
      ) {
        throw AppError.badRequest('Invite token has expired');
      }
      matched = candidate;
      break;
    }
  }

  if (!matched) {
    throw AppError.badRequest('Invalid invite token');
  }

  const passwordHash = await hashPassword(data.password);
  const user = await prisma.user.update({
    where: { id: matched.id },
    data: {
      passwordHash,
      name: data.name,
      phone: data.phone,
      status: UserStatus.ACTIVE,
      inviteTokenHash: null,
      inviteExpiresAt: null,
    },
  });

  emitAfterCommit('UserRegistered', {
    storeId: user.storeId,
    actorId: user.id,
    payload: {
      userId: user.id,
      role: user.role as never,
      storeId: user.storeId,
      email: user.email,
      invitedByUserId: null,
    },
  });

  const tokens = await issueTokens(user);
  return { user: publicUser(user), ...tokens };
}

export async function createInviteToken() {
  const token = randomBytes(24).toString('hex');
  const hash = await hashToken(token);
  return { token, hash, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) };
}

export function getMe(user: {
  id: string;
  email: string;
  name: string;
  role: string;
  storeId: string | null;
  impersonationSessionId?: string;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    storeId: user.storeId,
    impersonationSessionId: user.impersonationSessionId,
  };
}

export { issueTokens, publicUser, writeAuditLog, UserRole };
