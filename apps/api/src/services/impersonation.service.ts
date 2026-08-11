import { randomBytes } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { emitAfterCommit } from '../events/emit.js';
import { issueTokens } from './auth.service.js';
import { writeAuditLog } from './audit.service.js';
import { kvDel, kvGet, kvSet } from '../lib/redis.js';

const HANDOFF_PREFIX = 'impersonation-handoff:';
const HANDOFF_TTL_SECONDS = 60;

/**
 * Stores impersonation tokens server-side under a single-use opaque code
 * instead of returning raw JWTs to the caller. The code (not the tokens)
 * is safe to pass through a browser URL when opening the store-dashboard
 * in a new tab — it is high-entropy, expires quickly, and is deleted on
 * first use, unlike a JWT which would otherwise sit in browser history,
 * window.open referrer data, and any server access logs.
 */
async function createHandoff(tokens: { accessToken: string; refreshToken: string }) {
  const code = randomBytes(24).toString('base64url');
  await kvSet(`${HANDOFF_PREFIX}${code}`, JSON.stringify(tokens), HANDOFF_TTL_SECONDS);
  return code;
}

export async function exchangeImpersonationHandoff(code: string) {
  const key = `${HANDOFF_PREFIX}${code}`;
  const raw = await kvGet(key);
  if (!raw) {
    throw AppError.unauthorized('Impersonation handoff code is invalid or expired');
  }
  await kvDel(key);
  return JSON.parse(raw) as { accessToken: string; refreshToken: string };
}

export async function startImpersonation(
  storeId: string,
  actor: { id: string; role: string; ip?: string; userAgent?: string },
) {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    include: {
      owner: true,
    },
  });
  if (!store) throw AppError.notFound('Store not found');
  if (!store.owner) throw AppError.badRequest('Store has no owner');

  const session = await prisma.impersonationSession.create({
    data: {
      actorId: actor.id,
      storeId,
    },
  });

  // Issue tokens scoped to store owner identity + impersonation session
  const tokens = await issueTokens(
    {
      id: actor.id,
      role: 'MASTER_ADMIN',
      storeId,
    },
    { impersonationSessionId: session.id },
  );

  await writeAuditLog({
    actorId: actor.id,
    actorRole: actor.role as never,
    action: 'IMPERSONATION_STARTED',
    targetType: 'ImpersonationSession',
    targetId: session.id,
    storeId,
    impersonationSessionId: session.id,
    ip: actor.ip,
    userAgent: actor.userAgent,
  });

  emitAfterCommit('ImpersonationSessionStarted', {
    storeId,
    actorId: actor.id,
    payload: {
      storeId,
      sessionId: session.id,
      actorId: actor.id,
    },
  });

  const handoffCode = await createHandoff(tokens);

  return {
    session,
    store: { id: store.id, name: store.name, slug: store.slug },
    handoffCode,
  };
}

export async function endImpersonation(
  sessionId: string,
  actor: { id: string; role: string; ip?: string; userAgent?: string },
  endReason = 'manual',
) {
  const session = await prisma.impersonationSession.findUnique({
    where: { id: sessionId },
  });
  if (!session) throw AppError.notFound('Impersonation session not found');
  if (session.endedAt) {
    throw AppError.conflict('Impersonation session already ended');
  }
  if (session.actorId !== actor.id) {
    throw AppError.forbidden('Only the impersonating admin can end this session');
  }

  const ended = await prisma.impersonationSession.update({
    where: { id: sessionId },
    data: { endedAt: new Date(), endReason },
  });

  const durationSeconds = Math.round(
    (ended.endedAt!.getTime() - ended.startedAt.getTime()) / 1000,
  );

  await writeAuditLog({
    actorId: actor.id,
    actorRole: actor.role as never,
    action: 'IMPERSONATION_ENDED',
    targetType: 'ImpersonationSession',
    targetId: sessionId,
    storeId: session.storeId,
    impersonationSessionId: sessionId,
    ip: actor.ip,
    userAgent: actor.userAgent,
    metadata: { endReason, durationSeconds },
  });

  emitAfterCommit('ImpersonationSessionEnded', {
    storeId: session.storeId,
    actorId: actor.id,
    payload: {
      storeId: session.storeId,
      sessionId,
      actorId: actor.id,
      durationSeconds,
      endReason,
    },
  });

  // Restore master-admin tokens without store scope
  const tokens = await issueTokens({
    id: actor.id,
    role: 'MASTER_ADMIN',
    storeId: null,
  });

  return { session: ended, ...tokens };
}
