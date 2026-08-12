# CommerceNest Environment Variables

Copy `.env.example` to `.env` at the repository root. The API loads env via `dotenv` from the working directory.

## Runtime mapping note

`.env.example` uses some names that differ from what `apps/api/src/lib/env.ts` reads. Set **both** columns where applicable:

| `.env.example` | API runtime variable | Notes |
|----------------|---------------------|-------|
| `APP_BASE_DOMAIN` | `PLATFORM_DOMAIN` | Subdomain suffix for store URLs |
| `CORS_ORIGIN` | `CORS_ORIGINS` | Comma-separated allowed origins |
| `CLOUDINARY_URL` | — | Not parsed by API; use split vars below |
| `SMS_PROVIDER_API_KEY` | `SMS_PROVIDER` | API checks `SMS_PROVIDER` string |

---

## Core

### `NODE_ENV`

| | |
|---|---|
| **Example** | `development` |
| **Required** | No (default: `development`) |
| **Values** | `development`, `test`, `production` |
| **Purpose** | Controls logging verbosity, cookie security defaults, OTP dev code exposure |

### `PORT`

| | |
|---|---|
| **Example** | `4000` |
| **Required** | No (default: `4000`) |
| **Purpose** | HTTP port for the Express API |

---

## Database

### `DATABASE_URL`

| | |
|---|---|
| **Example** | `postgresql://commercenest:commercenest@localhost:5432/commercenest?schema=public` |
| **Required** | Yes for DB operations |
| **Purpose** | PostgreSQL connection string for Prisma |
| **Docker Compose** | Use `@postgres:5432` host when API runs inside compose |

---

## Redis

### `REDIS_URL`

| | |
|---|---|
| **Example** | `redis://localhost:6379` |
| **Required** | No |
| **Purpose** | Refresh token storage, rate limiting, OTP codes |
| **Fallback** | If unset or unreachable, API uses in-memory Map (fine for local dev; not for multi-instance production) |

---

## JWT / auth

### `JWT_ACCESS_SECRET`

| | |
|---|---|
| **Example** | `change-me-access-secret-min-32-chars` |
| **Required** | Yes in production |
| **Min length** | 32 characters |
| **Purpose** | HMAC secret for short-lived access tokens |

### `JWT_REFRESH_SECRET`

| | |
|---|---|
| **Example** | `change-me-refresh-secret-min-32-chars` |
| **Required** | Yes in production |
| **Min length** | 32 characters |
| **Purpose** | HMAC secret for refresh tokens |

### `JWT_ACCESS_TTL`

| | |
|---|---|
| **Example** | `15m` |
| **Default** | `15m` |
| **Purpose** | Access token lifetime (jsonwebtoken duration string) |

### `JWT_REFRESH_TTL`

| | |
|---|---|
| **Example** | `7d` |
| **Default** | `7d` |
| **Purpose** | Refresh token JWT expiry (actual revocation also uses Redis TTL) |

### `COOKIE_SECURE`

| | |
|---|---|
| **Example** | `true` |
| **Required** | No |
| **Purpose** | Set `Secure` flag on auth cookies (enable in production HTTPS) |

---

## Domains / CORS

### `APP_BASE_DOMAIN` (template)

| | |
|---|---|
| **Example** | `commercenest.local` |
| **Purpose** | Documented base domain for local dev |

### `PLATFORM_DOMAIN` (runtime)

| | |
|---|---|
| **Example** | `commercenest.local` (dev), `commercenest.com` (prod) |
| **Required** | No (default: `commercenest.local`) |
| **Purpose** | Used when seeding store subdomains and resolving storefront hostnames |

### `CORS_ORIGIN` (template)

| | |
|---|---|
| **Example** | `http://localhost:5173,http://localhost:5174,http://localhost:5175` |

### `CORS_ORIGINS` (runtime)

| | |
|---|---|
| **Example** | Same as above |
| **Default** | `http://localhost:3000` |
| **Purpose** | Comma-separated list of allowed browser origins for credentialed CORS |

---

## Media (Cloudinary)

**Required for production device uploads.** Optional in local development: without all three of `CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET` set, `getSignedUploadUrl` returns a `mode: 'stub'` response instead of a real Cloudinary signed upload, and the three theme-builder/media-picker upload components (`MediaImageField.tsx` in both `apps/admin-panel` and `apps/store-dashboard`) fall back to reading the file as a base64 `data:` URL client-side and storing that directly via `registerMediaAsset` — no external request is made, so uploads still work, but the "file" is now a large text blob living in the `media_assets.url` Postgres column instead of a CDN-hosted asset. That's fine for local dev, **not fine for production** (bloats the database, no image optimization, no CDN caching) — `apps/api/src/lib/env.ts` logs a startup warning (not a hard failure) when `NODE_ENV=production` and Cloudinary isn't fully configured, precisely so this doesn't go unnoticed.

The URL-paste "advanced" option in the media picker doesn't depend on Cloudinary either way — it just registers whatever URL the merchant supplies, validated server-side to be `http(s)://` or `data:image/...` only (rejects `javascript:`/`file:`/etc. schemes).

Server-side validation applied regardless of upload path (`apps/api/src/services/media.service.ts`): `mimeType` must be one of `image/png`, `image/jpeg`, `image/webp`, `image/svg+xml`, `image/gif`; `bytes` capped at 10MB. These are metadata/sanity checks, not a substitute for Cloudinary's own transfer-size enforcement on the real upload path.

### `CLOUDINARY_URL`

| | |
|---|---|
| **Example** | *(empty)* |
| **Purpose** | Documented in template; API uses split vars below |

### `CLOUDINARY_CLOUD_NAME`

| | |
|---|---|
| **Purpose** | Cloudinary cloud name |

### `CLOUDINARY_API_KEY`

| | |
|---|---|
| **Purpose** | Cloudinary API key |

### `CLOUDINARY_API_SECRET`

| | |
|---|---|
| **Purpose** | Cloudinary API secret for signed uploads |

---

## SMS

### `SMS_PROVIDER_API_KEY` (template)

Documented placeholder for a future provider key.

### `SMS_PROVIDER` (runtime)

| | |
|---|---|
| **Example** | *(empty)* |
| **Purpose** | When empty, SMS notifications are logged to stdout instead of sent |

---

## Seed bootstrap

These appear in `.env.example` for documentation. The seed script (`apps/api/src/seed.ts`) currently uses **hardcoded** credentials:

### `SEED_ADMIN_EMAIL`

| | |
|---|---|
| **Example** | `admin@commercenest.com` |
| **Actual seed** | Always `admin@commercenest.com` |

### `SEED_ADMIN_PASSWORD`

| | |
|---|---|
| **Example** | `ChangeMeAdmin123!` |
| **Actual seed password** | `Admin123!` |

### `SEED_ADMIN_NAME`

| | |
|---|---|
| **Example** | `Platform Owner` |
| **Purpose** | Display name for seeded Master Admin |

---

## Frontend build-time (Docker / CI)

Set as Docker build args or `.env` in each Vite app:

### `VITE_API_BASE_URL`

| | |
|---|---|
| **Example (local)** | `http://localhost:4000` |
| **Example (prod)** | `https://api.commercenest.com` |
| **Purpose** | Base URL for all frontend API clients |

### `VITE_STORE_SLUG`

| | |
|---|---|
| **Example** | `techworld-bd` |
| **Purpose** | Storefront app only — which store slug to load in dev/single-store deploy |

---

## Docker Compose overrides

Used in `docker-compose.yml`:

| Variable | Default | Purpose |
|----------|---------|---------|
| `POSTGRES_DB` | `commercenest` | Database name |
| `POSTGRES_USER` | `commercenest` | Database user |
| `POSTGRES_PASSWORD` | `commercenest` | Database password |

---

## Logging

### `LOG_LEVEL`

| | |
|---|---|
| **Default** | `info` |
| **Values** | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent` |
| **Purpose** | Pino logger level |

---

## Production checklist

1. Generate cryptographically random `JWT_*_SECRET` values (≥ 32 chars)
2. Set `NODE_ENV=production`, `COOKIE_SECURE=true`
3. Configure real `DATABASE_URL` and `REDIS_URL`
4. Set `PLATFORM_DOMAIN=commercenest.com`
5. Set `CORS_ORIGINS` to your admin, app, and storefront origins
6. Configure Cloudinary if media uploads are required
7. Do **not** rely on in-memory Redis fallback in multi-instance deployments
