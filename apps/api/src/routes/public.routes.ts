import { Router } from 'express';
import { asyncHandler } from '../lib/errors.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { param } from '../lib/params.js';
import * as packageService from '../services/package.service.js';
import * as trialService from '../services/trial.service.js';
import * as courierService from '../services/courier/courier.service.js';

/** Unauthenticated, platform-wide endpoints — pricing page + trial signup.
 * Not tenant-scoped (no storeId), so these live outside /api/store and
 * /api/storefront/:storeSlug. */
export const publicRouter = Router();

publicRouter.get(
  '/packages',
  asyncHandler(async (_req, res) => {
    res.json({ items: await packageService.listPublicPackages() });
  }),
);

publicRouter.post(
  '/trial-leads',
  rateLimit({ windowSeconds: 3600, max: 5, keyPrefix: 'rl:trial-lead-create' }),
  asyncHandler(async (req, res) => {
    const result = await trialService.createTrialLead(req.body);
    res.status(201).json({
      trialUrl: result.trialUrl,
      businessName: result.store.name,
      trialExpiresAt: result.store.trialExpiresAt,
    });
  }),
);

/**
 * Courier → CommerceNest delivery-status webhook. Not CommerceNest-user
 * authenticated (the courier isn't one of our users) — scoped by
 * storeId+provider in the URL itself, authenticated via the provider's own
 * scheme inside courierService.handleCourierWebhook (a bearer-token
 * comparison for Steadfast). Always responds 200 for a well-formed-but-
 * unrecognized payload (never throws for "didn't match anything we track")
 * so a legitimate courier never gets its webhook disabled by our own
 * server erroring on events we simply don't have a shipment for.
 */
publicRouter.post(
  '/webhooks/courier/:storeId/:provider',
  rateLimit({ windowSeconds: 60, max: 120, keyPrefix: 'rl:courier-webhook' }),
  asyncHandler(async (req, res) => {
    const result = await courierService.handleCourierWebhook(
      param(req, 'storeId'),
      param(req, 'provider'),
      req.headers as Record<string, string | undefined>,
      req.body,
    );
    res.json(result);
  }),
);
