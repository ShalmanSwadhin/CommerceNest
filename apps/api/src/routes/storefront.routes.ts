import { Router } from 'express';
import { z } from 'zod';
import { bangladeshPhoneSchema } from '@commercenest/types';
import { asyncHandler, AppError } from '../lib/errors.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { requireCustomer } from '../middleware/auth.js';
import * as storefrontService from '../services/storefront.service.js';
import * as paymentService from '../services/payment.service.js';
import * as domainService from '../services/domain.service.js';
import * as seoService from '../services/seo.service.js';
import * as returnService from '../services/return.service.js';
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
    });
    res.json({ items: categories });
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
