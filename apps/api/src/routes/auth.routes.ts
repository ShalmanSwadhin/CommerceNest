import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, AppError } from '../lib/errors.js';
import { env } from '../lib/env.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { requireAuth } from '../middleware/auth.js';
import * as authService from '../services/auth.service.js';
import * as impersonationService from '../services/impersonation.service.js';

export const authRouter = Router();

const cookieOpts = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: 'lax' as const,
  path: '/',
};

authRouter.post(
  '/login',
  rateLimit({ windowSeconds: 60, max: 20, keyPrefix: 'rl:login' }),
  asyncHandler(async (req, res) => {
    const result = await authService.login(req.body, {
      ip: req.ip,
      userAgent: req.header('user-agent') ?? undefined,
    });
    res.cookie('accessToken', result.accessToken, {
      ...cookieOpts,
      maxAge: 15 * 60 * 1000,
    });
    res.cookie('refreshToken', result.refreshToken, {
      ...cookieOpts,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.json({
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  }),
);

authRouter.post(
  '/refresh',
  rateLimit({ windowSeconds: 60, max: 60, keyPrefix: 'rl:refresh' }),
  asyncHandler(async (req, res) => {
    const token =
      req.body?.refreshToken ??
      (req as typeof req & { cookies?: Record<string, string> }).cookies
        ?.refreshToken;
    const result = await authService.refresh(token);
    res.cookie('accessToken', result.accessToken, {
      ...cookieOpts,
      maxAge: 15 * 60 * 1000,
    });
    res.cookie('refreshToken', result.refreshToken, {
      ...cookieOpts,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.json({
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const token =
      req.body?.refreshToken ??
      (req as typeof req & { cookies?: Record<string, string> }).cookies
        ?.refreshToken;
    await authService.logout(token);
    res.clearCookie('accessToken', cookieOpts);
    res.clearCookie('refreshToken', cookieOpts);
    res.json({ ok: true });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) {
      throw AppError.unauthorized();
    }
    res.json({ user: authService.getMe(req.user) });
  }),
);

authRouter.post(
  '/password/reset-request',
  rateLimit({ windowSeconds: 60, max: 10, keyPrefix: 'rl:pwdreset' }),
  asyncHandler(async (req, res) => {
    const result = await authService.requestPasswordReset(req.body);
    res.json(result);
  }),
);

authRouter.post(
  '/password/reset-confirm',
  rateLimit({ windowSeconds: 60, max: 20, keyPrefix: 'rl:pwdreset-confirm' }),
  asyncHandler(async (req, res) => {
    const result = await authService.confirmPasswordReset(req.body);
    res.json(result);
  }),
);

/**
 * Exchanges a single-use impersonation handoff code (minted by
 * POST /admin/stores/:id/impersonate) for the actual session tokens.
 * The code — not the tokens — is what travels through the browser URL
 * when Master Admin opens the store-dashboard in a new tab, so a leaked
 * URL (history/logs/referrer) is useless after 60s or first use.
 */
authRouter.post(
  '/impersonation/handoff',
  rateLimit({ windowSeconds: 60, max: 20, keyPrefix: 'rl:impersonation-handoff' }),
  asyncHandler(async (req, res) => {
    const code = z.string().trim().min(10).max(200).parse(req.body?.code);
    const result = await impersonationService.exchangeImpersonationHandoff(code);
    res.json(result);
  }),
);

authRouter.post(
  '/invite/accept',
  rateLimit({ windowSeconds: 60, max: 20, keyPrefix: 'rl:invite' }),
  asyncHandler(async (req, res) => {
    const result = await authService.acceptInvite(req.body);
    res.cookie('accessToken', result.accessToken, {
      ...cookieOpts,
      maxAge: 15 * 60 * 1000,
    });
    res.json({
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  }),
);
