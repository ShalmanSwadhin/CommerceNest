import { Router, type Request } from 'express';
import { z } from 'zod';
import { UserRole } from '@commercenest/types';
import { AppError, asyncHandler } from '../lib/errors.js';
import {
  requireAuth,
  requireRoles,
  STORE_STAFF_ROLES,
} from '../middleware/auth.js';
import { requireStoreScope } from '../middleware/storeScope.js';
import { rateLimit } from '../middleware/rateLimit.js';
import * as productService from '../services/product.service.js';
import * as categoryService from '../services/category.service.js';
import * as orderService from '../services/order.service.js';
import * as customerService from '../services/customer.service.js';
import * as paymentService from '../services/payment.service.js';
import * as analyticsService from '../services/analytics.service.js';
import * as mediaService from '../services/media.service.js';
import * as storeService from '../services/store.service.js';
import * as themeService from '../services/theme.service.js';
import * as domainService from '../services/domain.service.js';
import * as staffService from '../services/staff.service.js';
import * as supportService from '../services/support.service.js';
import * as announcementService from '../services/announcement.service.js';
import * as couponService from '../services/coupon.service.js';
import * as returnService from '../services/return.service.js';
import * as onboardingService from '../services/onboarding.service.js';
import { prisma } from '../lib/prisma.js';
import { param } from '../lib/params.js';

export const storeRouter = Router({ mergeParams: true });

storeRouter.use(requireAuth, requireRoles(...STORE_STAFF_ROLES), requireStoreScope);

function scopedStoreId(req: Request) {
  return req.storeId!;
}

function actor(req: Request) {
  return {
    id: req.user!.id,
    role: req.user!.role,
    impersonationSessionId: req.user!.impersonationSessionId,
    ip: req.ip,
    userAgent: req.header('user-agent') ?? undefined,
  };
}

// Store info (dashboard header)
storeRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await storeService.getStoreDashboardInfo(scopedStoreId(req)));
  }),
);

storeRouter.get(
  '/onboarding-checklist',
  asyncHandler(async (req, res) => {
    res.json(await onboardingService.getOnboardingChecklist(scopedStoreId(req)));
  }),
);

// Staff
storeRouter.get(
  '/staff',
  asyncHandler(async (req, res) => {
    res.json(await staffService.listStoreStaff(scopedStoreId(req)));
  }),
);

storeRouter.post(
  '/staff/invite',
  requireRoles(UserRole.STORE_OWNER, UserRole.MASTER_ADMIN),
  rateLimit({ windowSeconds: 60, max: 10, keyPrefix: 'rl:staff-invite' }),
  asyncHandler(async (req, res) => {
    res
      .status(201)
      .json(
        await staffService.inviteStoreStaff(
          scopedStoreId(req),
          req.body,
          actor(req),
        ),
      );
  }),
);

storeRouter.patch(
  '/staff/:userId',
  requireRoles(UserRole.STORE_OWNER, UserRole.MASTER_ADMIN),
  asyncHandler(async (req, res) => {
    res.json(
      await staffService.patchStoreStaff(
        scopedStoreId(req),
        param(req, 'userId'),
        req.body,
        actor(req),
      ),
    );
  }),
);

storeRouter.delete(
  '/staff/:userId',
  requireRoles(UserRole.STORE_OWNER, UserRole.MASTER_ADMIN),
  asyncHandler(async (req, res) => {
    res.json(
      await staffService.removeStoreStaff(
        scopedStoreId(req),
        param(req, 'userId'),
        actor(req),
      ),
    );
  }),
);

// Products
storeRouter.get(
  '/products',
  asyncHandler(async (req, res) => {
    res.json(await productService.listProducts(scopedStoreId(req), req.query));
  }),
);

storeRouter.post(
  '/products',
  requireRoles(
    UserRole.STORE_OWNER,
    UserRole.STORE_MANAGER,
    UserRole.INVENTORY_MANAGER,
    UserRole.MASTER_ADMIN,
  ),
  asyncHandler(async (req, res) => {
    res
      .status(201)
      .json(
        await productService.createProduct(
          scopedStoreId(req),
          req.body,
          req.user!.id,
        ),
      );
  }),
);

storeRouter.get(
  '/products/:productId',
  asyncHandler(async (req, res) => {
    res.json(
      await productService.getProduct(scopedStoreId(req), param(req, 'productId')),
    );
  }),
);

storeRouter.patch(
  '/products/:productId',
  requireRoles(
    UserRole.STORE_OWNER,
    UserRole.STORE_MANAGER,
    UserRole.INVENTORY_MANAGER,
    UserRole.MASTER_ADMIN,
  ),
  asyncHandler(async (req, res) => {
    res.json(
      await productService.updateProduct(
        scopedStoreId(req),
        param(req, 'productId'),
        req.body,
      ),
    );
  }),
);

storeRouter.post(
  '/products/:productId/archive',
  requireRoles(
    UserRole.STORE_OWNER,
    UserRole.STORE_MANAGER,
    UserRole.INVENTORY_MANAGER,
    UserRole.MASTER_ADMIN,
  ),
  asyncHandler(async (req, res) => {
    res.json(
      await productService.archiveProduct(
        scopedStoreId(req),
        param(req, 'productId'),
      ),
    );
  }),
);

storeRouter.post(
  '/products/:productId/stock',
  requireRoles(
    UserRole.STORE_OWNER,
    UserRole.STORE_MANAGER,
    UserRole.INVENTORY_MANAGER,
    UserRole.MASTER_ADMIN,
  ),
  asyncHandler(async (req, res) => {
    res.json(
      await productService.adjustVariantStock(
        scopedStoreId(req),
        param(req, 'productId'),
        req.body,
      ),
    );
  }),
);

// Categories
storeRouter.get(
  '/categories',
  asyncHandler(async (req, res) => {
    res.json(await categoryService.listCategories(scopedStoreId(req)));
  }),
);

storeRouter.post(
  '/categories',
  requireRoles(
    UserRole.STORE_OWNER,
    UserRole.STORE_MANAGER,
    UserRole.INVENTORY_MANAGER,
    UserRole.MASTER_ADMIN,
  ),
  asyncHandler(async (req, res) => {
    res
      .status(201)
      .json(await categoryService.createCategory(scopedStoreId(req), req.body));
  }),
);

storeRouter.patch(
  '/categories/:categoryId',
  requireRoles(
    UserRole.STORE_OWNER,
    UserRole.STORE_MANAGER,
    UserRole.INVENTORY_MANAGER,
    UserRole.MASTER_ADMIN,
  ),
  asyncHandler(async (req, res) => {
    res.json(
      await categoryService.updateCategory(
        scopedStoreId(req),
        param(req, 'categoryId'),
        req.body,
      ),
    );
  }),
);

storeRouter.delete(
  '/categories/:categoryId',
  requireRoles(
    UserRole.STORE_OWNER,
    UserRole.STORE_MANAGER,
    UserRole.MASTER_ADMIN,
  ),
  asyncHandler(async (req, res) => {
    res.json(
      await categoryService.deleteCategory(
        scopedStoreId(req),
        param(req, 'categoryId'),
      ),
    );
  }),
);

// Coupons
storeRouter.get(
  '/coupons',
  asyncHandler(async (req, res) => {
    res.json(await couponService.listCoupons(scopedStoreId(req), req.query));
  }),
);

storeRouter.post(
  '/coupons',
  requireRoles(UserRole.STORE_OWNER, UserRole.STORE_MANAGER, UserRole.MASTER_ADMIN),
  rateLimit({ windowSeconds: 60, max: 20, keyPrefix: 'rl:coupon-create' }),
  asyncHandler(async (req, res) => {
    res
      .status(201)
      .json(await couponService.createCoupon(scopedStoreId(req), req.body));
  }),
);

storeRouter.patch(
  '/coupons/:couponId',
  requireRoles(UserRole.STORE_OWNER, UserRole.STORE_MANAGER, UserRole.MASTER_ADMIN),
  asyncHandler(async (req, res) => {
    res.json(
      await couponService.updateCoupon(
        scopedStoreId(req),
        param(req, 'couponId'),
        req.body,
      ),
    );
  }),
);

storeRouter.delete(
  '/coupons/:couponId',
  requireRoles(UserRole.STORE_OWNER, UserRole.STORE_MANAGER, UserRole.MASTER_ADMIN),
  asyncHandler(async (req, res) => {
    res.json(
      await couponService.deleteCoupon(scopedStoreId(req), param(req, 'couponId')),
    );
  }),
);

// Returns & refunds
storeRouter.get(
  '/returns',
  asyncHandler(async (req, res) => {
    res.json(await returnService.listReturns(scopedStoreId(req), req.query));
  }),
);

storeRouter.post(
  '/returns/:returnId/approve',
  requireRoles(
    UserRole.STORE_OWNER,
    UserRole.STORE_MANAGER,
    UserRole.ORDER_MANAGER,
    UserRole.CUSTOMER_SUPPORT,
    UserRole.MASTER_ADMIN,
  ),
  asyncHandler(async (req, res) => {
    res.json(
      await returnService.approveReturn(
        scopedStoreId(req),
        param(req, 'returnId'),
        req.body,
      ),
    );
  }),
);

storeRouter.post(
  '/returns/:returnId/reject',
  requireRoles(
    UserRole.STORE_OWNER,
    UserRole.STORE_MANAGER,
    UserRole.ORDER_MANAGER,
    UserRole.CUSTOMER_SUPPORT,
    UserRole.MASTER_ADMIN,
  ),
  asyncHandler(async (req, res) => {
    res.json(
      await returnService.rejectReturn(
        scopedStoreId(req),
        param(req, 'returnId'),
        req.body,
      ),
    );
  }),
);

storeRouter.post(
  '/returns/:returnId/receive',
  requireRoles(
    UserRole.STORE_OWNER,
    UserRole.STORE_MANAGER,
    UserRole.ORDER_MANAGER,
    UserRole.MASTER_ADMIN,
  ),
  asyncHandler(async (req, res) => {
    res.json(
      await returnService.markItemReceived(scopedStoreId(req), param(req, 'returnId')),
    );
  }),
);

storeRouter.post(
  '/returns/:returnId/refund',
  requireRoles(UserRole.STORE_OWNER, UserRole.STORE_MANAGER, UserRole.MASTER_ADMIN),
  asyncHandler(async (req, res) => {
    res.json(
      await returnService.completeRefund(
        scopedStoreId(req),
        param(req, 'returnId'),
        req.body,
      ),
    );
  }),
);

const ORDER_READ_ROLES = [
  UserRole.STORE_OWNER,
  UserRole.STORE_MANAGER,
  UserRole.ORDER_MANAGER,
  UserRole.CUSTOMER_SUPPORT,
  UserRole.MASTER_ADMIN,
] as const;

// Orders
storeRouter.get(
  '/orders',
  requireRoles(...ORDER_READ_ROLES),
  asyncHandler(async (req, res) => {
    res.json(await orderService.listOrders(scopedStoreId(req), req.query));
  }),
);

storeRouter.get(
  '/orders/:orderId',
  requireRoles(...ORDER_READ_ROLES),
  asyncHandler(async (req, res) => {
    res.json(await orderService.getOrder(scopedStoreId(req), param(req, 'orderId')));
  }),
);

storeRouter.post(
  '/orders/:orderId/status',
  requireRoles(
    UserRole.STORE_OWNER,
    UserRole.STORE_MANAGER,
    UserRole.ORDER_MANAGER,
    UserRole.MASTER_ADMIN,
  ),
  asyncHandler(async (req, res) => {
    res.json(
      await orderService.transitionOrderStatus(
        scopedStoreId(req),
        param(req, 'orderId'),
        req.body,
        {
          id: req.user!.id,
          overrideReason: req.body?.overrideReason,
        },
      ),
    );
  }),
);

storeRouter.post(
  '/orders/:orderId/confirm-cod',
  requireRoles(
    UserRole.STORE_OWNER,
    UserRole.STORE_MANAGER,
    UserRole.ORDER_MANAGER,
    UserRole.CUSTOMER_SUPPORT,
    UserRole.MASTER_ADMIN,
  ),
  asyncHandler(async (req, res) => {
    res.json(
      await orderService.confirmCodCall(
        scopedStoreId(req),
        param(req, 'orderId'),
        req.body ?? {},
        req.user!.id,
      ),
    );
  }),
);

storeRouter.patch(
  '/orders/:orderId/courier',
  requireRoles(
    UserRole.STORE_OWNER,
    UserRole.STORE_MANAGER,
    UserRole.ORDER_MANAGER,
    UserRole.MASTER_ADMIN,
  ),
  asyncHandler(async (req, res) => {
    res.json(
      await orderService.updateCourier(
        scopedStoreId(req),
        param(req, 'orderId'),
        req.body ?? {},
      ),
    );
  }),
);

// Customers
storeRouter.get(
  '/customers',
  requireRoles(...ORDER_READ_ROLES),
  asyncHandler(async (req, res) => {
    res.json(await customerService.listCustomers(scopedStoreId(req), req.query));
  }),
);

storeRouter.get(
  '/customers/:customerId',
  requireRoles(...ORDER_READ_ROLES),
  asyncHandler(async (req, res) => {
    res.json(
      await customerService.getCustomer(
        scopedStoreId(req),
        param(req, 'customerId'),
      ),
    );
  }),
);

// Payments (manual bKash)
storeRouter.get(
  '/payments/pending-bkash',
  requireRoles(
    UserRole.STORE_OWNER,
    UserRole.STORE_MANAGER,
    UserRole.ORDER_MANAGER,
    UserRole.MASTER_ADMIN,
  ),
  asyncHandler(async (req, res) => {
    res.json(await paymentService.listPendingBkash(scopedStoreId(req)));
  }),
);

storeRouter.post(
  '/payments/bkash/approve',
  requireRoles(
    UserRole.STORE_OWNER,
    UserRole.STORE_MANAGER,
    UserRole.ORDER_MANAGER,
    UserRole.MASTER_ADMIN,
  ),
  rateLimit({ windowSeconds: 60, max: 30, keyPrefix: 'rl:bkash-approve' }),
  asyncHandler(async (req, res) => {
    res.json(
      await paymentService.verifyBkashPayment(
        scopedStoreId(req),
        { ...req.body, approved: true },
        actor(req),
      ),
    );
  }),
);

storeRouter.post(
  '/payments/bkash/reject',
  requireRoles(
    UserRole.STORE_OWNER,
    UserRole.STORE_MANAGER,
    UserRole.ORDER_MANAGER,
    UserRole.MASTER_ADMIN,
  ),
  rateLimit({ windowSeconds: 60, max: 30, keyPrefix: 'rl:bkash-reject' }),
  asyncHandler(async (req, res) => {
    res.json(
      await paymentService.verifyBkashPayment(
        scopedStoreId(req),
        { ...req.body, approved: false },
        actor(req),
      ),
    );
  }),
);

// Analytics
storeRouter.get(
  '/analytics/summary',
  requireRoles(UserRole.STORE_OWNER, UserRole.STORE_MANAGER, UserRole.MASTER_ADMIN),
  asyncHandler(async (req, res) => {
    res.json(await analyticsService.getStoreSummary(scopedStoreId(req)));
  }),
);

// Media
storeRouter.get(
  '/media',
  asyncHandler(async (req, res) => {
    res.json(await mediaService.listMedia(scopedStoreId(req), req.query));
  }),
);

const MEDIA_WRITE_ROLES = [
  UserRole.STORE_OWNER,
  UserRole.STORE_MANAGER,
  UserRole.INVENTORY_MANAGER,
  UserRole.MASTER_ADMIN,
] as const;

storeRouter.post(
  '/media/signed-url',
  requireRoles(...MEDIA_WRITE_ROLES),
  asyncHandler(async (req, res) => {
    res.json(await mediaService.getSignedUploadUrl(scopedStoreId(req), req.body));
  }),
);

storeRouter.post(
  '/media',
  requireRoles(...MEDIA_WRITE_ROLES),
  asyncHandler(async (req, res) => {
    res
      .status(201)
      .json(await mediaService.registerMediaAsset(scopedStoreId(req), req.body));
  }),
);

storeRouter.delete(
  '/media/:mediaId',
  requireRoles(...MEDIA_WRITE_ROLES),
  asyncHandler(async (req, res) => {
    res.json(
      await mediaService.deleteMedia(scopedStoreId(req), param(req, 'mediaId')),
    );
  }),
);

// Settings
storeRouter.get(
  '/settings/business',
  requireRoles(UserRole.STORE_OWNER, UserRole.STORE_MANAGER, UserRole.MASTER_ADMIN),
  asyncHandler(async (req, res) => {
    const store = await storeService.getStore(scopedStoreId(req));
    res.json({
      id: store.id,
      name: store.name,
      slug: store.slug,
      category: store.category,
      tagline: store.tagline,
      bkashNumber: store.bkashNumber,
      bkashInstructions: store.bkashInstructions,
      planTier: store.planTier,
      status: store.status,
      shippingInsideDhaka: store.shippingInsideDhaka,
      shippingOutsideDhaka: store.shippingOutsideDhaka,
      freeShippingThreshold: store.freeShippingThreshold,
    });
  }),
);

storeRouter.patch(
  '/settings/business',
  requireRoles(
    UserRole.STORE_OWNER,
    UserRole.STORE_MANAGER,
    UserRole.MASTER_ADMIN,
  ),
  asyncHandler(async (req, res) => {
    res.json(
      await storeService.updateBusinessSettings(scopedStoreId(req), req.body),
    );
  }),
);

// Theme — READ ONLY for store staff. Theme customization is a Master
// Admin-managed paid service (see SECURITY.md#theme-permission-model):
// merchants can view their current theme (for the "Theme & Design" info
// page) but cannot create drafts, publish, list version history, or roll
// back. All mutation endpoints below are Master Admin only — enforced here
// server-side, not just hidden in the UI, so a malicious Store Admin token
// gets a 403 even calling the API directly.
storeRouter.get(
  '/theme/current',
  asyncHandler(async (req, res) => {
    res.json(await themeService.getCurrentTheme(scopedStoreId(req)));
  }),
);

storeRouter.put(
  '/theme/draft',
  requireRoles(UserRole.MASTER_ADMIN),
  asyncHandler(async (req, res) => {
    res.json(
      await themeService.saveDraftTheme(scopedStoreId(req), req.body, req.user!.id),
    );
  }),
);

storeRouter.post(
  '/theme/publish',
  requireRoles(UserRole.MASTER_ADMIN),
  asyncHandler(async (req, res) => {
    res.json(await themeService.publishTheme(scopedStoreId(req), actor(req)));
  }),
);

storeRouter.get(
  '/theme/versions',
  requireRoles(UserRole.MASTER_ADMIN),
  asyncHandler(async (req, res) => {
    res.json(await themeService.listThemeVersions(scopedStoreId(req)));
  }),
);

storeRouter.post(
  '/theme/versions/:versionId/restore',
  requireRoles(UserRole.MASTER_ADMIN),
  asyncHandler(async (req, res) => {
    res.json(
      await themeService.restoreThemeVersion(
        scopedStoreId(req),
        param(req, 'versionId'),
        actor(req),
      ),
    );
  }),
);

// Request theme customization — routes into the existing store support-ticket
// system so Master Admin sees it in the same queue as other merchant requests.
storeRouter.post(
  '/theme/customization-request',
  requireRoles(UserRole.STORE_OWNER, UserRole.STORE_MANAGER, UserRole.MASTER_ADMIN),
  rateLimit({ windowSeconds: 3600, max: 5, keyPrefix: 'rl:theme-customization-request' }),
  asyncHandler(async (req, res) => {
    const message =
      typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    res.status(201).json(
      await supportService.createSupportTicket(
        scopedStoreId(req),
        {
          subject: 'Theme customization request',
          priority: 'NORMAL',
          body:
            message ||
            'Merchant requested custom theme design service via the Theme & Design page.',
        },
        actor(req),
      ),
    );
  }),
);

// Domains
storeRouter.get(
  '/domains',
  asyncHandler(async (req, res) => {
    res.json(await domainService.listDomains(scopedStoreId(req)));
  }),
);

storeRouter.post(
  '/domains',
  requireRoles(UserRole.STORE_OWNER, UserRole.MASTER_ADMIN),
  asyncHandler(async (req, res) => {
    res
      .status(201)
      .json(await domainService.addCustomDomain(scopedStoreId(req), req.body));
  }),
);

storeRouter.post(
  '/domains/verify',
  requireRoles(UserRole.STORE_OWNER, UserRole.MASTER_ADMIN),
  asyncHandler(async (req, res) => {
    res.json(await domainService.verifyDomain(scopedStoreId(req), req.body));
  }),
);

storeRouter.post(
  '/domains/primary',
  requireRoles(UserRole.STORE_OWNER, UserRole.MASTER_ADMIN),
  asyncHandler(async (req, res) => {
    res.json(await domainService.setPrimaryDomain(scopedStoreId(req), req.body));
  }),
);

// Platform announcements (read-only for store staff)
storeRouter.get(
  '/announcements',
  asyncHandler(async (req, res) => {
    res.json(
      await announcementService.listPublishedAnnouncementsForStores({
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      }),
    );
  }),
);

const SUPPORT_ROLES = [
  UserRole.STORE_OWNER,
  UserRole.STORE_MANAGER,
  UserRole.MASTER_ADMIN,
] as const;

// Store support tickets (merchant <-> platform, distinct from end-customer support)
storeRouter.get(
  '/support-tickets',
  requireRoles(...SUPPORT_ROLES),
  asyncHandler(async (req, res) => {
    res.json(
      await supportService.listSupportTickets({
        storeId: scopedStoreId(req),
        status:
          typeof req.query.status === 'string' ? req.query.status : undefined,
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      }),
    );
  }),
);

storeRouter.post(
  '/support-tickets',
  requireRoles(...SUPPORT_ROLES),
  asyncHandler(async (req, res) => {
    res
      .status(201)
      .json(
        await supportService.createSupportTicket(
          scopedStoreId(req),
          req.body,
          actor(req),
        ),
      );
  }),
);

storeRouter.get(
  '/support-tickets/:id',
  requireRoles(...SUPPORT_ROLES),
  asyncHandler(async (req, res) => {
    const ticket = await supportService.getSupportTicket(param(req, 'id'));
    if (ticket.storeId !== scopedStoreId(req)) {
      throw AppError.forbidden('Ticket does not belong to this store');
    }
    res.json(ticket);
  }),
);

storeRouter.post(
  '/support-tickets/:id/replies',
  requireRoles(...SUPPORT_ROLES),
  asyncHandler(async (req, res) => {
    const ticket = await supportService.getSupportTicket(param(req, 'id'));
    if (ticket.storeId !== scopedStoreId(req)) {
      throw AppError.forbidden('Ticket does not belong to this store');
    }
    res
      .status(201)
      .json(
        await supportService.replyToSupportTicket(
          param(req, 'id'),
          req.body,
          actor(req),
        ),
      );
  }),
);

// CMS content blocks
storeRouter.get(
  '/cms',
  asyncHandler(async (req, res) => {
    const blocks = await prisma.cmsContentBlock.findMany({
      where: { storeId: scopedStoreId(req) },
    });
    res.json({ items: blocks });
  }),
);

storeRouter.put(
  '/cms/bulk',
  requireRoles(
    UserRole.STORE_OWNER,
    UserRole.STORE_MANAGER,
    UserRole.MASTER_ADMIN,
  ),
  asyncHandler(async (req, res) => {
    const storeId = scopedStoreId(req);
    const body = z
      .object({
        blocks: z.array(
          z.object({
            key: z.string().trim().min(1).max(120),
            fields: z.unknown(),
          }),
        ),
      })
      .parse(req.body);

    const items = [];
    for (const block of body.blocks) {
      const saved = await prisma.cmsContentBlock.upsert({
        where: { storeId_key: { storeId, key: block.key } },
        create: {
          storeId,
          key: block.key,
          fields: block.fields as never,
        },
        update: { fields: block.fields as never },
      });
      items.push(saved);
    }
    res.json({ items });
  }),
);

storeRouter.put(
  '/cms/:key',
  requireRoles(
    UserRole.STORE_OWNER,
    UserRole.STORE_MANAGER,
    UserRole.MASTER_ADMIN,
  ),
  asyncHandler(async (req, res) => {
    const storeId = scopedStoreId(req);
    const key = param(req, 'key');
    const fields = req.body?.fields ?? req.body;
    const block = await prisma.cmsContentBlock.upsert({
      where: { storeId_key: { storeId, key } },
      create: { storeId, key, fields },
      update: { fields },
    });
    res.json(block);
  }),
);
