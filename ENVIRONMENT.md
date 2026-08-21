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
| **Required** | No for a single API instance; **yes** the moment you run more than one (see [SECURITY.md](./SECURITY.md#redis-when-its-actually-required) for exactly why) |
| **Purpose** | Refresh token revocation, rate-limit counters, OTP codes |
| **Fallback** | If unset or unreachable, API uses an in-process `Map` — correct for one instance, silently inconsistent across multiple instances/processes |
| **Production behavior** | `env.ts` prints a `console.error` at startup (not fatal) if unset in production, so "why is logout/rate-limiting flaky under load" is diagnosable from the first deploy log instead of rediscovered later |

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

### `CREDENTIALS_ENCRYPTION_KEY`

| | |
|---|---|
| **Example** | `change-me-credentials-encryption-key-min-32-chars` |
| **Required** | Yes in production |
| **Min length** | 32 characters |
| **Purpose** | AES-256-GCM key (via scrypt) encrypting per-store courier API credentials at rest. Deliberately separate from the JWT secrets above — rotating one never force-invalidates the other. See [COURIER_ARCHITECTURE.md](./COURIER_ARCHITECTURE.md) §5. |

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

## Email (SMTP)

**Postponed for V1, prepared cleanly, not forced on a paid vendor.** Transactional emails (order placed/confirmed/shipped/delivered, payment approved/rejected, return approved, refund completed) are wired through `apps/api/src/lib/email.ts`, a generic SMTP sender built on `nodemailer` — it works with **any** SMTP source: a merchant's own mailbox, a self-hosted mail server, or a transactional email service, whichever the operator chooses. No specific vendor is required or hardcoded.

Without all five of the variables below set, `hasSmtp` is `false` and every notification is logged (`channel: 'email'`, structured JSON, same pattern as SMS below) instead of sent — this is the default in local development and stays true in production until someone explicitly configures SMTP. `apps/api/src/lib/env.ts` prints a `console.warn` at production startup when SMTP isn't configured (not fatal — the platform is fully functional without email, notifications just don't reach an inbox).

A send failure (bad credentials, SMTP server down) is caught, logged (`logger.error`), and never propagates — a notification email is never allowed to be the reason an order/payment/return operation fails.

### `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM`

| | |
|---|---|
| **Example** | `smtp.gmail.com` / `587` / `false` / `you@yourdomain.com` / `app-password` / `"CommerceNest <noreply@yourdomain.com>"` |
| **Required** | No — omit all five to keep email log-only |
| **Purpose** | Standard SMTP connection details, passed straight to `nodemailer.createTransport` |

---

## SMS

Postponed for V1 — intentionally, not an oversight (see `DECISIONS.md`). SMS notifications are **always** logged, never sent, regardless of `SMS_PROVIDER` — that variable exists only to tag which provider *would* handle delivery once a real integration is built; setting it does not enable sending.

### `SMS_PROVIDER_API_KEY` (template)

Documented placeholder for a future provider key.

### `SMS_PROVIDER` (runtime)

| | |
|---|---|
| **Example** | *(empty)* |
| **Purpose** | Labels the `provider` field in the log-only SMS notification output. Does not enable real delivery — see above. |

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

## Requirements by deployment tier

Three distinct tiers, deliberately separated — do not assume what's true at one applies to the next.

### LOCAL DEVELOPMENT

Everything below just works out of the box with **no external services**: `npm install`, copy `.env.example` to `.env`, `npm run db:up` (embedded Postgres, no Docker needed), `npm run db:migrate && npm run db:seed`, `npm run dev`. JWT secrets, Cloudinary, SMTP, and Redis all have safe log-only/in-memory fallbacks — see each section above. `NODE_ENV` defaults to `development`, which is also the *only* value that exposes OTP `devCode`/invite `devToken` in API responses (see [SECURITY.md](./SECURITY.md)).

### MERCHANT PILOT (a handful of real stores, single VPS/container, low traffic)

A real domain and real credentials, but **Redis and Cloudinary are still genuinely optional** at this scale — a single API instance on the in-memory fallback is correct, and the URL-registration media path works without Cloudinary (device upload degrades to storing base64 in Postgres, which is fine short-term at pilot volume, not indefinitely):

1. Generate cryptographically random `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` (≥ 32 chars, never the dev defaults — the API refuses to boot in production with those)
2. `NODE_ENV=production`, `COOKIE_SECURE=true`
3. Real `DATABASE_URL` (see [DATABASE.md](./DATABASE.md) for migration + backup setup — `prisma migrate deploy`, never `db push`)
4. `PLATFORM_DOMAIN` set to your real base domain, `CORS_ORIGINS` set to your real admin/app/storefront origins (leaving either at its `.localhost`/`commercenest.local` development default doesn't open anything up, but it does silently break login/CORS in production — `env.ts` logs a `console.error` at startup if either is left at the default, precisely so this is diagnosed immediately rather than during a confused support call)
5. A committed initial `ALLOW_PROD_SEED` **should not** be set — the demo-store seed script refuses to run against `NODE_ENV=production` unless you explicitly opt in with a strong `SEED_ADMIN_PASSWORD`, specifically to prevent ever creating the well-known `Admin123!` account on a real database
6. Cloudinary and SMTP remain optional at this tier — configure them when you're ready, not before

### PRODUCTION (multiple API instances / meaningful merchant count / real launch)

Everything in MERCHANT PILOT, plus:

7. `REDIS_URL` — becomes **mandatory**, not optional, the moment you run more than one API instance/process (see [SECURITY.md](./SECURITY.md#redis-when-its-actually-required) for the specific failure modes of skipping this)
8. `CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET` — configure before merchants rely on device media upload as their primary workflow (non-technical merchants will; the URL-registration fallback is an advanced/secondary option, not a real substitute at scale)
9. `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASSWORD`/`SMTP_FROM` — configure so transactional emails actually reach customers instead of only appearing in logs
10. Confirm `prisma migrate status` reports "up to date" as part of your deploy pipeline (`prisma migrate deploy`, not `db push`) — see [DATABASE.md](./DATABASE.md#migrations)
11. Set up the backup/recovery procedure in [DATABASE.md](./DATABASE.md#backup--recovery) before you have real merchant data worth losing, not after
