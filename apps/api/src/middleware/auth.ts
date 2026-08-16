import type { NextFunction, Request, Response } from 'express';
import { UserRole, type UserRole as UserRoleType } from '@commercenest/types';
import { prisma } from '../lib/prisma.js';
import {
  isCustomerTokenPayload,
  verifyAnyAccessToken,
} from '../lib/jwt.js';
import { AppError } from '../lib/errors.js';

function extractBearer(req: Request): string | null {
  const header = req.header('authorization');
  if (header?.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }
  const cookieToken = (req as Request & { cookies?: Record<string, string> })
    .cookies?.accessToken;
  return cookieToken ?? null;
}

export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    const token = extractBearer(req);
    if (!token) {
      throw AppError.unauthorized();
    }

    const payload = verifyAnyAccessToken(token);

    // Customer JWT path (storefront)
    if (isCustomerTokenPayload(payload)) {
      const customer = await prisma.customer.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          storeId: true,
          phone: true,
          name: true,
          email: true,
        },
      });
      if (!customer || customer.storeId !== payload.storeId) {
        throw AppError.unauthorized('Customer is not active');
      }
      req.customer = customer;
      next();
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        storeId: true,
        status: true,
        emailVerified: true,
        phoneVerified: true,
      },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw AppError.unauthorized('User is not active');
    }

    let storeId = user.storeId;
    let impersonationSessionId = payload.impersonationSessionId;

    // Impersonation: override session storeId from active ImpersonationSession
    if (payload.impersonationSessionId) {
      const session = await prisma.impersonationSession.findUnique({
        where: { id: payload.impersonationSessionId },
      });
      if (!session || session.endedAt !== null) {
        throw AppError.unauthorized('Impersonation session is not active');
      }
      if (session.actorId !== user.id) {
        throw AppError.unauthorized('Impersonation session actor mismatch');
      }
      // Keep MASTER_ADMIN role; storeScope uses session storeId
      storeId = session.storeId;
      impersonationSessionId = session.id;
    }

    // Never trust client storeId — session storeId is authoritative
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      role: user.role as UserRoleType,
      storeId,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      impersonationSessionId,
    };
    next();
  } catch (err) {
    next(err);
  }
}

/** Requires a verified storefront customer JWT (sets req.customer). */
export async function requireCustomer(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    if (req.customer) {
      next();
      return;
    }

    const token = extractBearer(req);
    if (!token) {
      throw AppError.unauthorized();
    }

    const payload = verifyAnyAccessToken(token);
    if (!isCustomerTokenPayload(payload)) {
      throw AppError.unauthorized('Customer authentication required');
    }

    const customer = await prisma.customer.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        storeId: true,
        phone: true,
        name: true,
        email: true,
      },
    });
    if (!customer || customer.storeId !== payload.storeId) {
      throw AppError.unauthorized('Customer is not active');
    }

    req.customer = customer;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRoles(...roles: UserRoleType[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(AppError.unauthorized());
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(AppError.forbidden('Insufficient role permissions'));
      return;
    }
    next();
  };
}

export function requireMasterAdmin(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  if (!req.user) {
    next(AppError.unauthorized());
    return;
  }
  if (req.user.role !== UserRole.MASTER_ADMIN) {
    next(AppError.forbidden('Master Admin access required'));
    return;
  }
  next();
}

export const STORE_STAFF_ROLES: UserRoleType[] = [
  UserRole.STORE_OWNER,
  UserRole.STORE_MANAGER,
  UserRole.INVENTORY_MANAGER,
  UserRole.ORDER_MANAGER,
  UserRole.CUSTOMER_SUPPORT,
  UserRole.MASTER_ADMIN,
];
