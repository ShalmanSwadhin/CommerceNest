import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { z } from 'zod';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);
// Prefer monorepo root .env, then cwd/.env overrides.
config({ path: path.join(repoRoot, '.env') });
config();

const DEFAULT_JWT_ACCESS_SECRET = 'dev-access-secret-change-me-32chars!!';
const DEFAULT_JWT_REFRESH_SECRET = 'dev-refresh-secret-change-me-32chars!';
const DEFAULT_CORS_ORIGINS =
  'http://localhost:8080,http://admin.localhost:8080,http://app.localhost:8080,http://techworld-bd.localhost:8080';
const DEFAULT_PLATFORM_DOMAIN = 'commercenest.local';

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1).optional(),
  REDIS_URL: z.string().optional(),
  JWT_ACCESS_SECRET: z
    .string()
    .min(32)
    .default(DEFAULT_JWT_ACCESS_SECRET),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32)
    .default(DEFAULT_JWT_REFRESH_SECRET),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  COOKIE_SECURE: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  CORS_ORIGINS: z.string().default(DEFAULT_CORS_ORIGINS),
  PLATFORM_DOMAIN: z.string().default(DEFAULT_PLATFORM_DOMAIN),
  GATEWAY_PORT: z.coerce.number().int().positive().optional(),
  CORS_ALLOW_LOCALHOST_SUBDOMAINS: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
  CLOUDINARY_CLOUD_NAME: z.string().optional().default(''),
  CLOUDINARY_API_KEY: z.string().optional().default(''),
  CLOUDINARY_API_SECRET: z.string().optional().default(''),
  // Provider-agnostic naming so swapping providers later is a config change,
  // not a code change — see lib/sms.ts for the provider boundary. Currently
  // 'twilio' is the only real adapter implemented; empty/unset uses the
  // local-stub (dev/test only — see hasSmsProvider below).
  SMS_PROVIDER: z.string().optional().default(''),
  SMS_PROVIDER_API_KEY: z.string().optional().default(''),
  SMS_PROVIDER_API_SECRET: z.string().optional().default(''),
  SMS_PROVIDER_SENDER_ID: z.string().optional().default(''),
  // Generic SMTP — works with any provider (a merchant's own mailbox, a
  // self-hosted mail server, or a transactional-email service) rather than
  // integrating one specific paid vendor's API. Empty by default: emails
  // are logged, not sent, until all of host/user/password/from are set.
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().int().positive().optional().default(587),
  SMTP_SECURE: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASSWORD: z.string().optional().default(''),
  SMTP_FROM: z.string().optional().default(''),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  SEED_ADMIN_EMAIL: z.string().email().optional(),
  SEED_ADMIN_PASSWORD: z.string().min(8).optional(),
  SEED_ADMIN_NAME: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment variables');
}

export const env = parsed.data;

/** True when a real (non-stub) SMS provider is fully configured. See lib/sms.ts. */
export const hasSmsProvider =
  env.SMS_PROVIDER === 'twilio' &&
  Boolean(env.SMS_PROVIDER_API_KEY) &&
  Boolean(env.SMS_PROVIDER_API_SECRET) &&
  Boolean(env.SMS_PROVIDER_SENDER_ID);

// Production hard requirements: real secrets + database
if (env.NODE_ENV === 'production') {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required when NODE_ENV=production');
  }
  if (
    env.JWT_ACCESS_SECRET === DEFAULT_JWT_ACCESS_SECRET ||
    env.JWT_REFRESH_SECRET === DEFAULT_JWT_REFRESH_SECRET
  ) {
    throw new Error(
      'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must not use development defaults in production',
    );
  }
  if (!env.COOKIE_SECURE) {
    throw new Error('COOKIE_SECURE must be set to "true" when NODE_ENV=production');
  }
  const hasCloudinaryConfig =
    Boolean(env.CLOUDINARY_CLOUD_NAME) &&
    Boolean(env.CLOUDINARY_API_KEY) &&
    Boolean(env.CLOUDINARY_API_SECRET);
  if (!hasCloudinaryConfig) {
    // Deliberately not fatal — the URL-registration media path still works
    // without Cloudinary (a merchant can link an already-hosted image), so
    // refusing to boot the whole platform over this would be disproportionate.
    // But it must never be silent: device uploads (the primary, expected path
    // for non-technical merchants) silently degrade to storing base64 data
    // URLs directly in Postgres — no CDN, no image optimization, unbounded
    // row growth. console.error (not warn) so this survives typical
    // production log-level filtering and paging/alerting on error-level logs.
    console.error(
      '[env] PRODUCTION MISCONFIGURATION: CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET are not ' +
        'fully set. Device media uploads (Theme Builder, product images) will silently fall back ' +
        'to storing base64 data URLs directly in Postgres instead of a CDN. The URL-registration ' +
        'media option still works without Cloudinary, but device upload does not belong in ' +
        'production without it — configure all three CLOUDINARY_* variables before launch.',
    );
  }
  if (env.CORS_ORIGINS === DEFAULT_CORS_ORIGINS) {
    // Not fatal — the default only allows *.localhost origins, so leaving it
    // unset in production breaks legitimate cross-origin requests from the
    // real frontends rather than opening anything up. Still worth a loud
    // heads-up, since "the admin panel can't log in" is a confusing way to
    // discover a missing env var.
    console.error(
      '[env] PRODUCTION MISCONFIGURATION: CORS_ORIGINS is unset — using the localhost-only ' +
        'development default. Real production frontend origins will be rejected by CORS until ' +
        'CORS_ORIGINS is set explicitly (e.g. https://admin.commercenest.com,https://app.commercenest.com,...).',
    );
  }
  if (env.PLATFORM_DOMAIN === DEFAULT_PLATFORM_DOMAIN) {
    console.error(
      '[env] PRODUCTION MISCONFIGURATION: PLATFORM_DOMAIN is unset — using the "commercenest.local" ' +
        'development default. Storefront subdomain/custom-domain resolution and the CORS subdomain ' +
        'allowlist will not recognize real merchant domains until PLATFORM_DOMAIN is set to your ' +
        'real base domain (e.g. commercenest.com).',
    );
  }
  if (!env.REDIS_URL) {
    // Not fatal — a single API instance works correctly on the in-memory
    // fallback (refresh-token revocation, rate limiting, OTP codes all still
    // function). It silently breaks the moment you run more than one API
    // instance/process behind a load balancer, since each process would have
    // its own independent in-memory state. See DEPLOYMENT.md/SECURITY.md for
    // exactly when this becomes mandatory.
    console.error(
      '[env] PRODUCTION NOTICE: REDIS_URL is not set — refresh-token revocation, rate limiting, ' +
        'and OTP codes are using an in-memory fallback. This is fine for a single API instance, ' +
        'but silently breaks (inconsistent rate limits, revoked tokens still working, lost OTP ' +
        'codes) the moment you run more than one API instance/process. Set REDIS_URL before scaling ' +
        'horizontally.',
    );
  }
  const hasSmtpConfig =
    Boolean(env.SMTP_HOST) && Boolean(env.SMTP_USER) && Boolean(env.SMTP_PASSWORD) && Boolean(env.SMTP_FROM);
  if (!hasSmtpConfig) {
    // A genuine warn, not error: unlike Cloudinary/Redis/CORS, this has no
    // security or data-integrity implication — the platform is fully
    // functional without it, order/payment/return notifications just stay
    // log-only instead of reaching the customer's inbox.
    console.warn(
      '[env] SMTP_* is not configured — transactional emails (order placed/confirmed/shipped/' +
        'delivered, payment approved/rejected, return approved, refund completed) are logged, not ' +
        'sent. Set SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASSWORD/SMTP_FROM to enable real delivery ' +
        '(any SMTP provider works — a merchant mailbox, self-hosted mail server, or a transactional ' +
        'email service).',
    );
  }
  if (!hasSmsProvider) {
    // Unlike SMTP above, this IS a hard functional break, not a degraded
    // nice-to-have: customer OTP login is the *only* customer authentication
    // mechanism (see DECISIONS.md — no password login exists). Without a
    // real SMS provider, requestOtp() has no way to deliver the code and
    // will reject every request with SMS_UNAVAILABLE (503) rather than
    // silently using the dev-only local-stub — see lib/sms.ts.
    console.error(
      '[env] PRODUCTION MISCONFIGURATION: No real SMS provider is configured (SMS_PROVIDER/' +
        'SMS_PROVIDER_API_KEY/SMS_PROVIDER_API_SECRET/SMS_PROVIDER_SENDER_ID). Customer OTP login ' +
        'will fail every request with a 503 SMS_UNAVAILABLE error — the local-stub OTP delivery is ' +
        'refused outright in production rather than silently pretending to send. Configure a real ' +
        'provider before launch; see lib/sms.ts and OTP_IMPLEMENTATION_REPORT.md.',
    );
  }
}

export const corsOrigins = env.CORS_ORIGINS.split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/** Allow explicit origins + *.localhost gateway hosts + PLATFORM_DOMAIN subdomains. */
export function isAllowedCorsOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  if (corsOrigins.includes(origin) || corsOrigins.includes('*')) return true;

  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    if (
      env.CORS_ALLOW_LOCALHOST_SUBDOMAINS !== false &&
      (host === 'localhost' || host.endsWith('.localhost'))
    ) {
      return true;
    }
    const base = env.PLATFORM_DOMAIN.toLowerCase();
    if (host === base || host.endsWith(`.${base}`)) return true;
  } catch {
    return false;
  }
  return false;
}

export const hasCloudinary =
  Boolean(env.CLOUDINARY_CLOUD_NAME) &&
  Boolean(env.CLOUDINARY_API_KEY) &&
  Boolean(env.CLOUDINARY_API_SECRET);

export const hasSmtp =
  Boolean(env.SMTP_HOST) &&
  Boolean(env.SMTP_USER) &&
  Boolean(env.SMTP_PASSWORD) &&
  Boolean(env.SMTP_FROM);
