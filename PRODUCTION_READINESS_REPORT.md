# CommerceNest — Production Readiness Report

Date: 2026-08-10

This report reflects verification actually performed in this pass (audit → implement → test → fix → retest). **Do not treat “build passes” alone as production-ready.**

## Verdict

CommerceNest V1 core multi-tenant commerce loop is **functionally wired and verified by automated API/integration tests**, including tenant isolation and manual bKash approve. It is **not yet fully production-ready** for live customer OTP/SMS, real media CDN, or automated custom-domain DNS/SSL without external credentials/services.

## Features completed (working UI + API + DB + auth)

- Multi-tenant architecture: Master Admin / Store Admin / Storefront
- Tenant isolation on store APIs (`TENANT_MISMATCH` enforced; integration-tested)
- Master Admin: stores, users, payments (platform bKash), announcements, support (list/detail/reply/status), theme editor (draft/publish/rollback), analytics, settings hooks
- Store Admin: dashboard, products, orders, customers, payments (bKash approve/reject), analytics, CMS, media (URL register), theme (read-only), settings, staff invite, announcements inbox, support ticket create
- Storefront: host/subdomain resolve (fail-closed), published theme application, catalog, cart, checkout, two-step manual bKash, order lookup, OTP login (dev code), account orders, CMS pages (`/pages/:key`)
- Domain resolve gated to `VERIFIED` hostnames
- Docker compose no longer forces a default storefront slug (host resolve enabled)

## Incomplete / out of V1 / external blockers

| Item | Status |
|------|--------|
| Coupons / product reviews | Out of V1 (no schema) |
| License/seat management | Placeholder UI |
| Real SMS OTP delivery | Needs `SMS_PROVIDER*` credentials |
| Password-reset email | Stub without mail provider |
| Cloudinary binary uploads | URL-register stub without Cloudinary credentials |
| Custom domain DNS/SSL automation | Token verify only; nginx sketch for `*.commercenest.local` |
| Prisma migrations folder | Uses `db push` (deploy risk) |
| Full browser E2E (desktop/mobile) | Not automated in CI |

## Tests performed and results

```
npm run test -w @commercenest/api
```

- **19 passed / 0 failed / 0 skipped**
- Embedded Postgres (`embedded-postgres` on port 55441) used for isolation — not production DB
- Coverage includes: master admin login, platform analytics, tenant isolation, published theme storefront home, MANUAL_BKASH checkout + staff approve, resolve-host, announcement create, order state machine unit tests, customer risk unit tests

```
npm run build
```

- types, prisma, api, admin-panel, store-dashboard, storefront — **all succeeded**

App `tsc --noEmit` typechecks succeeded as part of Vite builds.

## Security issues found / fixed

| Issue | Action |
|-------|--------|
| Impersonation JWT ignored store override | Fixed earlier (session storeId honored) |
| Unverified domains resolving tenants | Fixed — require `DomainStatus.VERIFIED` |
| Storefront fallback slug inventing TechWorld | Fixed — fail closed / store-not-found |
| Checkout requiring txn while UI was two-step | Fixed — txn optional at place; submit via `/payments/bkash` |
| Compose baking `VITE_STORE_SLUG` | Fixed — empty default for multi-tenant |
| Cross-store product access | Confirmed 403 in tests |
| Master Admin broad store access without impersonation | Intentional for platform ops; impersonation path mismatch still enforced |

Remaining ops risks: token-in-query for impersonation handoff; OTP without SMS in production; Redis required for multi-instance.

## Build results

- `@commercenest/types` — pass
- `@commercenest/prisma` — pass
- `@commercenest/api` — pass
- `@commercenest/admin-panel` — pass
- `@commercenest/store-dashboard` — pass
- `@commercenest/storefront` — pass

## Local run commands

```powershell
# From repo root
copy .env.example .env
npm install
# Start Postgres + Redis (Docker Compose if available), then:
npm run db:push
npm run db:seed

npm run dev:api          # http://localhost:4000
npm run dev:admin        # http://localhost:5173
npm run dev:dashboard    # http://localhost:5174
npm run dev:storefront   # http://localhost:5175 (VITE_STORE_SLUG=techworld-bd for local)

npm run test -w @commercenest/api
npm run build
```

### Seed logins

- Master Admin: `admin@commercenest.com` / `Admin123!`
- TechWorld BD owner: `owner@techworld.bd` / `Owner123!`
- Storefront slug: `techworld-bd` (local) / host `techworld-bd.commercenest.local`

### Manual bKash E2E (local)

1. Storefront checkout → MANUAL_BKASH → place order (or include txn)
2. If txn omitted, submit txn on next step
3. Store Admin → Payments → approve/reject
4. Confirm order `paymentStatus` updates
