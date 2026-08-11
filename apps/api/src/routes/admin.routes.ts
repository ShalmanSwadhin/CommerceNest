import { Router, type Request } from 'express';
import { z } from 'zod';
import { asyncHandler, AppError } from '../lib/errors.js';
import { requireAuth, requireMasterAdmin } from '../middleware/auth.js';
import * as storeService from '../services/store.service.js';
import * as analyticsService from '../services/analytics.service.js';
import * as auditService from '../services/audit.service.js';
import * as impersonationService from '../services/impersonation.service.js';
import * as themeService from '../services/theme.service.js';
import * as domainService from '../services/domain.service.js';
import * as paymentService from '../services/payment.service.js';
import * as adminUsersService from '../services/admin-users.service.js';
import * as announcementService from '../services/announcement.service.js';
import * as supportService from '../services/support.service.js';
import { prisma } from '../lib/prisma.js';
import { param } from '../lib/params.js';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireMasterAdmin);

function actorFrom(req: Request) {
  return {
    id: req.user!.id,
    role: req.user!.role,
    ip: req.ip,
    userAgent: req.header('user-agent') ?? undefined,
  };
}

// --- Stores ---
adminRouter.get(
  '/stores',
  asyncHandler(async (req, res) => {
    const result = await storeService.listStores({
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json(result);
  }),
);

adminRouter.post(
  '/stores',
  asyncHandler(async (req, res) => {
    const result = await storeService.createStore(req.body, actorFrom(req));
    res.status(201).json(result);
  }),
);

adminRouter.get(
  '/stores/:id',
  asyncHandler(async (req, res) => {
    const store = await storeService.getStore(param(req, 'id'));
    res.json(store);
  }),
);

adminRouter.patch(
  '/stores/:id',
  asyncHandler(async (req, res) => {
    res.json(
      await storeService.updateStore(param(req, 'id'), req.body, actorFrom(req)),
    );
  }),
);

adminRouter.post(
  '/stores/:id/suspend',
  asyncHandler(async (req, res) => {
    const reason = z.string().trim().min(1).parse(req.body?.reason);
    const store = await storeService.suspendStore(
      param(req, 'id'),
      reason,
      actorFrom(req),
    );
    res.json(store);
  }),
);

adminRouter.post(
  '/stores/:id/reactivate',
  asyncHandler(async (req, res) => {
    const store = await storeService.reactivateStore(
      param(req, 'id'),
      actorFrom(req),
    );
    res.json(store);
  }),
);

adminRouter.post(
  '/stores/:id/archive',
  asyncHandler(async (req, res) => {
    const store = await storeService.archiveStore(param(req, 'id'), actorFrom(req));
    res.json(store);
  }),
);

adminRouter.get(
  '/stores/:id/domains',
  asyncHandler(async (req, res) => {
    res.json(await domainService.listDomains(param(req, 'id')));
  }),
);

adminRouter.post(
  '/stores/:id/domains',
  asyncHandler(async (req, res) => {
    res
      .status(201)
      .json(await domainService.addCustomDomain(param(req, 'id'), req.body));
  }),
);

// --- Payments (platform-wide) ---
adminRouter.get(
  '/payments/pending',
  asyncHandler(async (_req, res) => {
    res.json(await paymentService.listPendingBkashAllStores());
  }),
);

adminRouter.post(
  '/payments/:orderId/approve',
  asyncHandler(async (req, res) => {
    res.json(
      await paymentService.verifyBkashPaymentByOrderId(
        param(req, 'orderId'),
        true,
        actorFrom(req),
      ),
    );
  }),
);

adminRouter.post(
  '/payments/:orderId/reject',
  asyncHandler(async (req, res) => {
    const rejectionReason = z
      .string()
      .trim()
      .min(1)
      .max(500)
      .parse(req.body?.rejectionReason ?? req.body?.reason);
    res.json(
      await paymentService.verifyBkashPaymentByOrderId(
        param(req, 'orderId'),
        false,
        actorFrom(req),
        rejectionReason,
      ),
    );
  }),
);

// --- Users ---
adminRouter.get(
  '/users',
  asyncHandler(async (req, res) => {
    res.json(
      await adminUsersService.listStaffUsers({
        role: typeof req.query.role === 'string' ? req.query.role : undefined,
        storeId:
          typeof req.query.storeId === 'string' ? req.query.storeId : undefined,
        search:
          typeof req.query.search === 'string' ? req.query.search : undefined,
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      }),
    );
  }),
);

adminRouter.patch(
  '/users/:id',
  asyncHandler(async (req, res) => {
    res.json(
      await adminUsersService.patchStaffUser(
        param(req, 'id'),
        req.body,
        actorFrom(req),
      ),
    );
  }),
);

// --- Announcements ---
adminRouter.get(
  '/announcements',
  asyncHandler(async (req, res) => {
    res.json(
      await announcementService.listAnnouncements({
        status:
          typeof req.query.status === 'string' ? req.query.status : undefined,
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      }),
    );
  }),
);

adminRouter.post(
  '/announcements',
  asyncHandler(async (req, res) => {
    res
      .status(201)
      .json(
        await announcementService.createAnnouncement(req.body, actorFrom(req)),
      );
  }),
);

adminRouter.patch(
  '/announcements/:id',
  asyncHandler(async (req, res) => {
    res.json(
      await announcementService.patchAnnouncement(
        param(req, 'id'),
        req.body,
        actorFrom(req),
      ),
    );
  }),
);

// --- Support tickets ---
adminRouter.get(
  '/support-tickets',
  asyncHandler(async (req, res) => {
    res.json(
      await supportService.listSupportTickets({
        storeId:
          typeof req.query.storeId === 'string' ? req.query.storeId : undefined,
        status:
          typeof req.query.status === 'string' ? req.query.status : undefined,
        priority:
          typeof req.query.priority === 'string'
            ? req.query.priority
            : undefined,
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      }),
    );
  }),
);

adminRouter.get(
  '/support-tickets/:id',
  asyncHandler(async (req, res) => {
    res.json(await supportService.getSupportTicket(param(req, 'id')));
  }),
);

adminRouter.patch(
  '/support-tickets/:id',
  asyncHandler(async (req, res) => {
    res.json(
      await supportService.patchSupportTicket(
        param(req, 'id'),
        req.body,
        actorFrom(req),
      ),
    );
  }),
);

adminRouter.post(
  '/support-tickets/:id/replies',
  asyncHandler(async (req, res) => {
    res
      .status(201)
      .json(
        await supportService.replyToSupportTicket(
          param(req, 'id'),
          req.body,
          actorFrom(req),
        ),
      );
  }),
);

// --- Analytics ---
adminRouter.get(
  '/analytics/summary',
  asyncHandler(async (_req, res) => {
    res.json(await analyticsService.getPlatformSummary());
  }),
);

// --- Audit ---
adminRouter.get(
  '/audit-logs',
  asyncHandler(async (req, res) => {
    res.json(
      await auditService.listAuditLogs({
        storeId:
          typeof req.query.storeId === 'string' ? req.query.storeId : undefined,
        action:
          typeof req.query.action === 'string' ? req.query.action : undefined,
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      }),
    );
  }),
);

// --- Impersonation ---
adminRouter.post(
  '/stores/:id/impersonate',
  asyncHandler(async (req, res) => {
    const result = await impersonationService.startImpersonation(
      param(req, 'id'),
      actorFrom(req),
    );
    res.json(result);
  }),
);

adminRouter.post(
  '/impersonate/:sessionId/end',
  asyncHandler(async (req, res) => {
    const result = await impersonationService.endImpersonation(
      param(req, 'sessionId'),
      actorFrom(req),
      typeof req.body?.endReason === 'string' ? req.body.endReason : 'manual',
    );
    res.json(result);
  }),
);

adminRouter.post(
  '/impersonation/end',
  asyncHandler(async (req, res) => {
    const sessionId =
      (typeof req.body?.sessionId === 'string' && req.body.sessionId) ||
      req.user?.impersonationSessionId;
    if (!sessionId) {
      throw AppError.badRequest(
        'sessionId is required (body or active impersonation JWT)',
      );
    }
    const result = await impersonationService.endImpersonation(
      sessionId,
      actorFrom(req),
      typeof req.body?.endReason === 'string' ? req.body.endReason : 'manual',
    );
    res.json(result);
  }),
);

// --- Theme (Master Admin) ---
adminRouter.get(
  '/stores/:id/theme',
  asyncHandler(async (req, res) => {
    res.json(await themeService.getDraftTheme(param(req, 'id')));
  }),
);

adminRouter.put(
  '/stores/:id/theme/draft',
  asyncHandler(async (req, res) => {
    res.json(
      await themeService.saveDraftTheme(param(req, 'id'), req.body, req.user!.id),
    );
  }),
);

adminRouter.post(
  '/stores/:id/theme/publish',
  asyncHandler(async (req, res) => {
    res.json(await themeService.publishTheme(param(req, 'id'), actorFrom(req)));
  }),
);

adminRouter.get(
  '/stores/:id/theme/versions',
  asyncHandler(async (req, res) => {
    res.json(await themeService.listThemeVersions(param(req, 'id')));
  }),
);

adminRouter.post(
  '/stores/:id/theme/versions/:versionId/restore',
  asyncHandler(async (req, res) => {
    res.json(
      await themeService.restoreThemeVersion(
        param(req, 'id'),
        param(req, 'versionId'),
        actorFrom(req),
      ),
    );
  }),
);

// --- Platform settings ---
adminRouter.get(
  '/settings',
  asyncHandler(async (_req, res) => {
    const settings = await prisma.platformSettings.findMany();
    res.json({
      items: settings.map((s) => ({ key: s.key, value: s.value })),
    });
  }),
);

adminRouter.patch(
  '/settings',
  asyncHandler(async (req, res) => {
    const items = z
      .record(z.string(), z.unknown())
      .parse(req.body?.items ?? req.body);

    const upserted = [];
    for (const [key, value] of Object.entries(items)) {
      const setting = await prisma.platformSettings.upsert({
        where: { key },
        create: { key, value: value as never },
        update: { value: value as never },
      });
      upserted.push({ key: setting.key, value: setting.value });
    }

    await auditService.writeAuditLog({
      actorId: req.user!.id,
      actorRole: req.user!.role as never,
      action: 'PLATFORM_SETTINGS_UPDATED',
      targetType: 'PlatformSettings',
      metadata: { keys: Object.keys(items) },
      ip: req.ip,
      userAgent: req.header('user-agent') ?? undefined,
    });

    res.json({ items: upserted });
  }),
);

adminRouter.put(
  '/settings/:key',
  asyncHandler(async (req, res) => {
    const key = param(req, 'key');
    const value = req.body?.value ?? req.body;
    const setting = await prisma.platformSettings.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
    await auditService.writeAuditLog({
      actorId: req.user!.id,
      actorRole: req.user!.role as never,
      action: 'PLATFORM_SETTINGS_UPDATED',
      targetType: 'PlatformSettings',
      targetId: setting.id,
      metadata: { key },
      ip: req.ip,
      userAgent: req.header('user-agent') ?? undefined,
    });
    res.json(setting);
  }),
);
