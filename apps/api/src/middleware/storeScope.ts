import type { NextFunction, Request, Response } from 'express';
import { UserRole } from '@commercenest/types';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { param } from '../lib/params.js';
import { writeAuditLog } from '../services/audit.service.js';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Resolves /api/store/:storeId/* and enforces tenant isolation.
 * Session storeId (or Master Admin impersonation) is the only trusted source.
 * Client-supplied storeId in body/query is never trusted for authorization.
 */
export async function requireStoreScope(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    if (!req.user) {
      throw AppError.unauthorized();
    }

    const paramStoreId = param(req, 'storeId');

    const isMasterAdmin = req.user.role === UserRole.MASTER_ADMIN;
    const sessionStoreId = req.user.storeId;

    if (isMasterAdmin) {
      // Master admin may access any store; prefer impersonation session store
      if (
        req.user.impersonationSessionId &&
        sessionStoreId &&
        sessionStoreId !== paramStoreId
      ) {
        throw AppError.tenantMismatch(
          'Impersonation session store does not match path storeId',
        );
      }
    } else {
      if (!sessionStoreId) {
        throw AppError.forbidden('User is not assigned to a store');
      }
      if (sessionStoreId !== paramStoreId) {
        throw AppError.tenantMismatch(
          'Cross-store access denied — path storeId does not match session',
        );
      }
    }

    const store = await prisma.store.findUnique({
      where: { id: paramStoreId },
      select: { id: true, slug: true, name: true, status: true },
    });

    if (!store) {
      throw AppError.notFound('Store not found');
    }

    if (store.status === 'SUSPENDED' && !isMasterAdmin) {
      throw AppError.forbidden('Store is suspended', 'STORE_SUSPENDED');
    }

    req.storeId = store.id;
    req.store = store;

    // Master Admin mutating tenant data without an active impersonation
    // session bypasses the normal impersonation audit trail — log it
    // explicitly so there's a record of direct platform-ops writes.
    if (
      isMasterAdmin &&
      !req.user.impersonationSessionId &&
      MUTATING_METHODS.has(req.method)
    ) {
      writeAuditLog({
        actorId: req.user.id,
        actorRole: req.user.role as never,
        action: 'MASTER_ADMIN_DIRECT_STORE_WRITE',
        targetType: 'Store',
        targetId: store.id,
        storeId: store.id,
        metadata: { method: req.method, path: req.originalUrl },
        ip: req.ip,
        userAgent: req.header('user-agent') ?? undefined,
      }).catch(() => undefined);
    }

    next();
  } catch (err) {
    next(err);
  }
}

/** Helper for services: assert resource.storeId matches scoped store */
export function assertStoreMatch(
  resourceStoreId: string,
  scopedStoreId: string,
) {
  if (resourceStoreId !== scopedStoreId) {
    throw AppError.tenantMismatch();
  }
}
