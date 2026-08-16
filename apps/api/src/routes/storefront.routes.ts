import { Router } from 'express';
import { z } from 'zod';
import {
  bangladeshPhoneSchema,
  customerLoginSchema,
  customerRegisterSchema,
  customerRequestPasswordResetSchema,
  customerResetPasswordSchema,
  EmailVerificationSubject,
} from '@commercenest/types';
import { asyncHandler, AppError } from '../lib/errors.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { requireCustomer } from '../middleware/auth.js';
import * as storefrontService from '../services/storefront.service.js';
import * as paymentService from '../services/payment.service.js';
import * as domainService from '../services/domain.service.js';
import * as seoService from '../services/seo.service.js';
import * as returnService from '../services/return.service.js';
import * as verificationService from '../services/verification.service.js';
import { prisma } from '../lib/prisma.js';
import { param } from '../lib/params.js';

/** Routes mounted at /api/storefront (no storeSlug) */
export const storefrontRootRouter = Router();

storefrontRootRouter.post(
  '/resolve-host',
  asyncHandler(async (req, res) => {
    const host = z
      .string()
      .trim()
      .min(1)
      .parse(req.body?.host ?? req.query.host);
    res.json(await domainService.resolveStoreByHost(host));
  }),
);

storefrontRootRouter.get(
  '/resolve-host',
  asyncHandler(async (req, res) => {
    const host = z
      .string()
      .trim()
      .min(1)
      .parse(typeof req.query.host === 'string' ? req.query.host : undefined);
    res.json(await domainService.resolveStoreByHost(host));
  }),
);

/** Per-tenant sitemap/robots — resolved from the Host header via the gateway. */
storefrontRootRouter.get(
  '/_seo/sitemap.xml',
  rateLimit({ windowSeconds: 60, max: 30, keyPrefix: 'rl:sf:sitemap' }),
  asyncHandler(async (req, res) => {
    const host = req.header('x-forwarded-host') ?? req.header('host') ?? '';
    const xml = await seoService.getSitemapXml(host);
    res.type('application/xml').send(xml);
  }),
);

storefrontRootRouter.get(
  '/_seo/robots.txt',
  rateLimit({ windowSeconds: 60, max: 30, keyPrefix: 'rl:sf:robots' }),
  asyncHandler(async (req, res) => {
    const host = req.header('x-forwarded-host') ?? req.header('host') ?? '';
    const txt = await seoService.getRobotsTxt(host);
    res.type('text/plain').send(txt);
  }),
);

export const storefrontRouter = Router({ mergeParams: true });

const orderLookupSchema = z.object({
  orderNumber: z.string().trim().min(1),
  phone: bangladeshPhoneSchema,
});

const publicCatalogRateLimit = rateLimit({
  windowSeconds: 60,
  max: 120,
  keyPrefix: 'rl:sf:catalog',
});

storefrontRouter.get(
  '/',
  publicCatalogRateLimit,
  asyncHandler(async (req, res) => {
    res.json(
      await storefrontService.getStorefrontSummary(param(req, 'storeSlug')),
    );
  }),
);

storefrontRouter.get(
  '/home',
  publicCatalogRateLimit,
  asyncHandler(async (req, res) => {
    res.json(await storefrontService.getStorefrontHome(param(req, 'storeSlug')));
  }),
);

const storefrontProductQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  search: z.string().trim().max(100).optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc', 'name_asc']).optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
  inStock: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

storefrontRouter.get(
  '/products',
  rateLimit({ windowSeconds: 60, max: 120, keyPrefix: 'rl:sf:products' }),
  asyncHandler(async (req, res) => {
    const query = storefrontProductQuerySchema.parse(req.query);
    res.json(
      await storefrontService.listStorefrontProducts(
        param(req, 'storeSlug'),
        query,
      ),
    );
  }),
);

storefrontRouter.get(
  '/products/:productSlug',
  publicCatalogRateLimit,
  asyncHandler(async (req, res) => {
    res.json(
      await storefrontService.getStorefrontProduct(
        param(req, 'storeSlug'),
        param(req, 'productSlug'),
      ),
    );
  }),
);

storefrontRouter.get(
  '/categories',
  publicCatalogRateLimit,
  asyncHandler(async (req, res) => {
    const store = await storefrontService.resolveStoreBySlug(
      param(req, 'storeSlug'),
    );
    const categories = await prisma.category.findMany({
      where: { storeId: store.id },
      orderBy: { name: 'asc' },
      include: {
        // Themes can show a representative photo per category — derived
        // from the category's own catalog (no separate "category image"
        // field to manage), so it's only ever a real product photo, never
        // a placeholder or fabricated asset.
        products: {
          where: { status: 'ACTIVE' },
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { images: true },
        },
      },
    });
    const items = categories.map(({ products, ...category }) => {
      const firstImages = Array.isArray(products[0]?.images)
        ? (products[0]?.images as Array<{ url?: string }>)
        : [];
      return { ...category, imageUrl: firstImages[0]?.url || null };
    });
    res.json({ items });
  }),
);

storefrontRouter.get(
  '/cms/:key',
  publicCatalogRateLimit,
  asyncHandler(async (req, res) => {
    const store = await storefrontService.resolveStoreBySlug(
      param(req, 'storeSlug'),
    );
    const key = param(req, 'key');
    const block = await prisma.cmsContentBlock.findUnique({
      where: { storeId_key: { storeId: store.id, key } },
    });
    if (!block) throw AppError.notFound('Content not found');
    const fields = (block.fields ?? {}) as Record<string, unknown>;
    res.json({
      key: block.key,
      title: typeof fields.title === 'string' ? fields.title : null,
      body: typeof fields.body === 'string' ? fields.body : null,
      fields,
      updatedAt: block.updatedAt,
    });
  }),
);

storefrontRouter.get(
  '/categories/:categorySlug/products',
  rateLimit({ windowSeconds: 60, max: 120, keyPrefix: 'rl:sf:catproducts' }),
  asyncHandler(async (req, res) => {
    const query = storefrontProductQuerySchema.parse(req.query);
    res.json(
      await storefrontService.listCategoryProducts(
        param(req, 'storeSlug'),
        param(req, 'categorySlug'),
        query,
      ),
    );
  }),
);

storefrontRouter.post(
  '/checkout',
  rateLimit({ windowSeconds: 60, max: 30, keyPrefix: 'rl:checkout' }),
  asyncHandler(async (req, res) => {
    res
      .status(201)
      .json(await storefrontService.checkout(param(req, 'storeSlug'), req.body));
  }),
);

storefrontRouter.post(
  '/payments/bkash',
  rateLimit({ windowSeconds: 60, max: 30, keyPrefix: 'rl:bkash' }),
  asyncHandler(async (req, res) => {
    const store = await storefrontService.resolveStoreBySlug(
      param(req, 'storeSlug'),
    );
    res.json(await paymentService.submitBkashPayment(store.id, req.body));
  }),
);

async function handleOrderLookup(req: import('express').Request) {
  const raw = {
    orderNumber: req.body?.orderNumber ?? req.query.orderNumber,
    phone: req.body?.phone ?? req.query.phone,
  };
  const body = orderLookupSchema.parse(raw);
  return storefrontService.lookupOrder(param(req, 'storeSlug'), body);
}

storefrontRouter.post(
  '/orders/lookup',
  rateLimit({ windowSeconds: 60, max: 30, keyPrefix: 'rl:orderlookup' }),
  asyncHandler(async (req, res) => {
    res.json(await handleOrderLookup(req));
  }),
);

storefrontRouter.get(
  '/orders/lookup',
  rateLimit({ windowSeconds: 60, max: 30, keyPrefix: 'rl:orderlookup' }),
  asyncHandler(async (req, res) => {
    res.json(await handleOrderLookup(req));
  }),
);

storefrontRouter.post(
  '/auth/otp/request',
  rateLimit({ windowSeconds: 60, max: 10, keyPrefix: 'rl:otp' }),
  asyncHandler(async (req, res) => {
    const phone = bangladeshPhoneSchema.parse(req.body?.phone);
    res.json(await storefrontService.requestOtp(param(req, 'storeSlug'), phone));
  }),
);

storefrontRouter.post(
  '/auth/otp/verify',
  rateLimit({ windowSeconds: 60, max: 20, keyPrefix: 'rl:otpverify:ip' }),
  rateLimit({
    windowSeconds: 600,
    max: 8,
    keyPrefix: 'rl:otpverify:phone',
    keyFn: (req) =>
      `${param(req, 'storeSlug')}:${String(req.body?.phone ?? 'unknown')}`,
  }),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        phone: bangladeshPhoneSchema,
        code: z.string().trim().min(4).max(8),
      })
      .parse(req.body);
    res.json(
      await storefrontService.verifyOtp(
        param(req, 'storeSlug'),
        body.phone,
        body.code,
      ),
    );
  }),
);

// ---------------------------------------------------------------------------
// Name/email/password auth — the PRIMARY storefront login method. Phone OTP
// above remains available independently (a second login method, and — once
// authenticated — an optional verification add-on, see /account/*-verification
// below). Neither replaces the other.
// ---------------------------------------------------------------------------

storefrontRouter.post(
  '/auth/register',
  rateLimit({ windowSeconds: 60, max: 10, keyPrefix: 'rl:customer-register' }),
  asyncHandler(async (req, res) => {
    const data = customerRegisterSchema.parse(req.body);
    res.status(201).json(
      await storefrontService.registerCustomer(param(req, 'storeSlug'), {
        name: data.name,
        email: data.email,
        password: data.password,
        phone: data.phone,
      }),
    );
  }),
);

storefrontRouter.post(
  '/auth/login',
  rateLimit({ windowSeconds: 60, max: 20, keyPrefix: 'rl:customer-login' }),
  asyncHandler(async (req, res) => {
    const data = customerLoginSchema.parse(req.body);
    res.json(
      await storefrontService.loginCustomer(param(req, 'storeSlug'), data),
    );
  }),
);

storefrontRouter.post(
  '/auth/password/reset-request',
  rateLimit({ windowSeconds: 60, max: 10, keyPrefix: 'rl:customer-pwdreset' }),
  asyncHandler(async (req, res) => {
    const data = customerRequestPasswordResetSchema.parse(req.body);
    res.json(
      await storefrontService.requestCustomerPasswordReset(
        param(req, 'storeSlug'),
        data.email,
      ),
    );
  }),
);

storefrontRouter.post(
  '/auth/password/reset-confirm',
  rateLimit({ windowSeconds: 60, max: 20, keyPrefix: 'rl:customer-pwdreset-confirm' }),
  asyncHandler(async (req, res) => {
    const data = customerResetPasswordSchema.parse(req.body);
    res.json(
      await storefrontService.confirmCustomerPasswordReset(
        param(req, 'storeSlug'),
        data.token,
        data.password,
      ),
    );
  }),
);

// ---------------------------------------------------------------------------
// Optional post-login verification — available to a customer regardless of
// which login method they used. Reuses verification.service.ts (email
// tokens) and lib/otp.ts via verification.service.ts (phone OTP) — no
// separate implementation.
// ---------------------------------------------------------------------------

storefrontRouter.post(
  '/account/email-verification/send',
  requireCustomer,
  rateLimit({ windowSeconds: 60, max: 5, keyPrefix: 'rl:customer-email-verify-send' }),
  asyncHandler(async (req, res) => {
    if (!req.customer) throw AppError.unauthorized();
    const store = await storefrontService.resolveStoreBySlug(param(req, 'storeSlug'));
    if (req.customer.storeId !== store.id) {
      throw AppError.forbidden('Customer does not belong to this store');
    }
    const profile = await storefrontService.getCustomerProfile(
      param(req, 'storeSlug'),
      req.customer.id,
    );
    if (!profile.email) {
      throw AppError.badRequest('Add an email address to your account first.');
    }
    if (profile.emailVerified) {
      res.json({ ok: true, message: 'Email already verified.', alreadyVerified: true });
      return;
    }
    // Storefront requests already arrive on the tenant subdomain (e.g.
    // techworld-bd.localhost:8080) — same-origin as the page the link
    // should return the customer to, so no separate config is needed here.
    const origin = `${req.protocol}://${req.get('host')}`;
    res.json(
      await verificationService.sendEmailVerification({
        subjectType: EmailVerificationSubject.CUSTOMER,
        subjectId: req.customer.id,
        email: profile.email,
        name: profile.name,
        verifyUrlBase: `${origin}/verify-email`,
      }),
    );
  }),
);

storefrontRouter.post(
  '/account/email-verification/verify',
  rateLimit({ windowSeconds: 60, max: 20, keyPrefix: 'rl:customer-email-verify-confirm' }),
  asyncHandler(async (req, res) => {
    const token = z.string().trim().min(1).parse(req.body?.token);
    res.json(
      await verificationService.confirmEmailVerification(
        EmailVerificationSubject.CUSTOMER,
        token,
      ),
    );
  }),
);

storefrontRouter.post(
  '/account/phone-verification/send',
  requireCustomer,
  rateLimit({ windowSeconds: 60, max: 10, keyPrefix: 'rl:customer-phone-verify-send' }),
  asyncHandler(async (req, res) => {
    if (!req.customer) throw AppError.unauthorized();
    const store = await storefrontService.resolveStoreBySlug(param(req, 'storeSlug'));
    if (req.customer.storeId !== store.id) {
      throw AppError.forbidden('Customer does not belong to this store');
    }
    const phone = bangladeshPhoneSchema.parse(req.body?.phone);
    res.json(
      await verificationService.sendPhoneVerificationOtp(
        EmailVerificationSubject.CUSTOMER,
        req.customer.id,
        phone,
      ),
    );
  }),
);

storefrontRouter.post(
  '/account/phone-verification/verify',
  requireCustomer,
  rateLimit({ windowSeconds: 60, max: 20, keyPrefix: 'rl:customer-phone-verify-confirm:ip' }),
  rateLimit({
    windowSeconds: 600,
    max: 8,
    keyPrefix: 'rl:customer-phone-verify-confirm:customer',
    keyFn: (req) => String(req.customer?.id ?? 'unknown'),
  }),
  asyncHandler(async (req, res) => {
    if (!req.customer) throw AppError.unauthorized();
    const store = await storefrontService.resolveStoreBySlug(param(req, 'storeSlug'));
    if (req.customer.storeId !== store.id) {
      throw AppError.forbidden('Customer does not belong to this store');
    }
    const body = z
      .object({ phone: bangladeshPhoneSchema, code: z.string().trim().min(4).max(8) })
      .parse(req.body);
    res.json(
      await verificationService.confirmPhoneVerificationOtp(
        EmailVerificationSubject.CUSTOMER,
        req.customer.id,
        body.phone,
        body.code,
      ),
    );
  }),
);

storefrontRouter.get(
  '/me',
  requireCustomer,
  asyncHandler(async (req, res) => {
    if (!req.customer) throw AppError.unauthorized();
    const store = await storefrontService.resolveStoreBySlug(
      param(req, 'storeSlug'),
    );
    if (req.customer.storeId !== store.id) {
      throw AppError.forbidden('Customer does not belong to this store');
    }
    res.json({
      customer: await storefrontService.getCustomerProfile(
        param(req, 'storeSlug'),
        req.customer.id,
      ),
    });
  }),
);

storefrontRouter.get(
  '/account/orders',
  requireCustomer,
  asyncHandler(async (req, res) => {
    if (!req.customer) throw AppError.unauthorized();
    const store = await storefrontService.resolveStoreBySlug(
      param(req, 'storeSlug'),
    );
    if (req.customer.storeId !== store.id) {
      throw AppError.forbidden('Customer does not belong to this store');
    }
    res.json(
      await storefrontService.listCustomerOrders(
        param(req, 'storeSlug'),
        req.customer.id,
        {
          page: req.query.page ? Number(req.query.page) : undefined,
          limit: req.query.limit ? Number(req.query.limit) : undefined,
        },
      ),
    );
  }),
);

storefrontRouter.get(
  '/account/returns',
  requireCustomer,
  asyncHandler(async (req, res) => {
    if (!req.customer) throw AppError.unauthorized();
    const store = await storefrontService.resolveStoreBySlug(
      param(req, 'storeSlug'),
    );
    if (req.customer.storeId !== store.id) {
      throw AppError.forbidden('Customer does not belong to this store');
    }
    res.json({
      items: await returnService.listCustomerReturns(store.id, req.customer.id),
    });
  }),
);

storefrontRouter.post(
  '/account/returns',
  requireCustomer,
  rateLimit({ windowSeconds: 60, max: 10, keyPrefix: 'rl:sf:return-request' }),
  asyncHandler(async (req, res) => {
    if (!req.customer) throw AppError.unauthorized();
    const store = await storefrontService.resolveStoreBySlug(
      param(req, 'storeSlug'),
    );
    if (req.customer.storeId !== store.id) {
      throw AppError.forbidden('Customer does not belong to this store');
    }
    res
      .status(201)
      .json(
        await returnService.createReturnRequest(store.id, req.customer.id, req.body),
      );
  }),
);
