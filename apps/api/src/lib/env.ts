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
  CORS_ORIGINS: z
    .string()
    .default(
      'http://localhost:8080,http://admin.localhost:8080,http://app.localhost:8080,http://techworld-bd.localhost:8080',
    ),
  PLATFORM_DOMAIN: z.string().default('commercenest.local'),
  GATEWAY_PORT: z.coerce.number().int().positive().optional(),
  CORS_ALLOW_LOCALHOST_SUBDOMAINS: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
  CLOUDINARY_CLOUD_NAME: z.string().optional().default(''),
  CLOUDINARY_API_KEY: z.string().optional().default(''),
  CLOUDINARY_API_SECRET: z.string().optional().default(''),
  SMS_PROVIDER: z.string().optional().default(''),
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
    // Not fatal — device uploads fall back to storing a base64 data URL
    // directly in Postgres, which works but doesn't belong in production
    // (no CDN, no image optimization, bloats the database). Merchants can
    // still use the URL-registration path without Cloudinary.
    console.warn(
      '[env] CLOUDINARY_* is not configured in production — device media uploads will ' +
        'fall back to storing base64 data URLs directly in the database instead of a CDN. ' +
        'Configure CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET before merchants rely on device upload.',
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
