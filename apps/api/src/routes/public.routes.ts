import { Router } from 'express';
import { asyncHandler } from '../lib/errors.js';
import { rateLimit } from '../middleware/rateLimit.js';
import * as packageService from '../services/package.service.js';
import * as trialService from '../services/trial.service.js';

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
