# CommerceNest — Production Readiness Report

Date: 2026-08-12 (supersedes the 2026-08-10 version of this report — that snapshot predates coupons, returns/refunds, server-computed shipping, committed Prisma migrations, the RBAC/passwordHash/rate-limiting hardening pass, and the email/audit-log work below; do not rely on it)

This report reflects verification actually performed in this pass (audit → implement → test → fix → retest). **Do not treat "build passes" alone as production-ready.**

## Verdict

CommerceNest V1 is a genuine **release candidate for a real merchant pilot**, contingent on the external configuration listed under "Remaining external configuration" below. Core multi-tenant commerce (catalog, cart, checkout, COD, manual bKash, coupons, server-computed shipping, returns/refunds), tenant isolation, RBAC, and the Theme Builder are functionally complete, security-hardened, and verified end-to-end against a live gateway — not just unit-tested in isolation. It is **not** production-ready for a large-scale/multi-instance launch without Redis, real Cloudinary credentials, and an SMTP provider configured (all three degrade gracefully rather than breaking, but degraded is not the production target).

## Features completed (working UI + API + DB + auth, verified live)

- Multi-tenant architecture: Master Admin / Store Admin / Storefront, gateway-routed (`admin.`/`app.`/`{slug}.` subdomains)
- Tenant isolation on every store-scoped resource type (products, orders, customers, media, CMS, theme, coupons, returns, staff, settings, analytics) — both reads and writes, integration-tested across 12 GET + 6 POST/PATCH/PUT endpoint families, not just products
- Master Admin: stores (list/detail/create/suspend/reactivate/archive), users (list/edit-role/deactivate), impersonation (secure handoff-code flow), payments (platform bKash), announcements (create/edit/archive), support (list/detail/reply/status), theme editor (draft/publish/version-history/rollback), analytics, audit logs, settings
- Store Admin: dashboard, products (create/edit/archive, multi-variant, images), categories (full CRUD), orders (status pipeline, courier fields), customers + risk tiers, payments (bKash approve/reject), coupons (CRUD), returns (review/approve/reject/receive/refund), analytics, CMS, media (device upload + library + URL), **Theme Builder** (ported from Master Admin, full parity — branding/colors/typography/header/sections/drag-reorder/live-preview/draft/publish/version-history/rollback), staff (invite/role/remove), business settings incl. shipping rates, bKash config, subscription plan-limit enforcement (product count, staff seats)
- Storefront: host/subdomain resolve (fail-closed), published theme rendering, catalog with search/sort/price-filter/in-stock-filter, cart, checkout (COD + two-step manual bKash), **coupon codes** (server-computed discount), **server-computed delivery charge** (inside/outside Dhaka + free-shipping threshold — client can never set this), order tracking, OTP login, account + order history, **return requests** (customer-initiated, full lifecycle to refund), CMS pages, per-store SEO (sitemap.xml/robots.txt/canonical/OG/JSON-LD, isolated from platform hosts)
- Committed Prisma migration history (`packages/prisma/migrations/`) — `migrate deploy` is the sole documented production path; `db push` is local-prototyping-only and explicitly warned against everywhere it's mentioned

## Incomplete / out of V1 / external blockers

| Item | Status |
|------|--------|
| Product reviews, wishlist, loyalty | Out of V1 by design (postponed, not started) |
| License/seat management UI | Placeholder — subscription *limits* are enforced server-side (plan-tier product/staff caps), but there's no self-serve plan-change UI |
| Real SMS delivery | Architecturally ready to swap in (`SMS_PROVIDER` env var, `logSmsLocally` is the single integration point), but intentionally not implemented — postponed per product decision |
| Real email delivery | **Architecture complete**, not activated by default: generic SMTP sender (`apps/api/src/lib/email.ts`, `nodemailer`, any provider) wired to all 8 commerce notification events with correct recipient resolution; log-only until `SMTP_*` env vars are set |
| Cloudinary device uploads | Fully implemented and production-ready *when configured*; without credentials, falls back to storing base64 data URLs in Postgres (works, not CDN-backed — a loud `console.error` fires at production startup if unconfigured) |
| Custom domain DNS/SSL automation | Token verify only; no automated DNS/ACME provisioning |
| Redis | Optional for a single API instance (in-memory fallback is correct at that scale); **mandatory** the moment you run more than one instance — see SECURITY.md |
| Full cross-browser/device manual QA | Automated Playwright smoke coverage (39 pages, 0 console/network errors) + static responsive-class audit performed; no real-device lab testing |

## Tests performed and results

```
npm run build -w @commercenest/types
npm run build -w @commercenest/api
npm run build -w @commercenest/admin-panel
npm run build -w @commercenest/store-dashboard
npm run build -w @commercenest/storefront
npm run build -w @commercenest/marketing
```
**All 6 workspaces build clean.**

```
npm run test -w @commercenest/api
```
**26 passed / 0 failed / 0 skipped.** Coverage includes: master admin login + platform analytics, tenant isolation across every store-scoped resource type (reads + writes), unauthenticated/cross-role/garbage-token boundary rejection, `passwordHash` absence from every customer/order response (recursive scanner, not a spot-check), `INVENTORY_MANAGER` least-privilege denial from orders/customers/support, `MANUAL_BKASH` checkout → staff approve, order-state-machine unit tests, customer-risk unit tests, theme-document normalization unit tests.

```
npm run test:e2e
```
**39/39 pages visited, zero console errors, zero failed network requests, zero page errors** — marketing (3 pages), Master Admin (12 pages incl. login+submit), Store Admin (15 pages incl. login+submit, Coupons/Returns/Categories), Storefront (9 pages incl. product click-through).

**Live gateway regression** (manual, against the real dev stack, not mocked):
- Full customer journey: search → category sort/filter → product → cart → checkout with coupon + server-computed outside-Dhaka shipping → order tracking. Verified math: subtotal 2598 + delivery 120 (outside-Dhaka rate) = total 2718 (no coupon case); separately, subtotal 1899 + delivery 60 (inside-Dhaka) − discount 189.9 (10% coupon) = total 1769.1.
- Manual bKash: checkout → submit txn → staff approve → `paymentStatus: APPROVED`.
- Returns: customer OTP login → request return on a `DELIVERED` order → staff approve → mark item received → complete refund → order `paymentStatus: REFUNDED`, return `status: REFUNDED` with amount/method recorded.
- Impersonation: start (handoff code, no raw JWT in the response) → exchange (real tokens) → impersonated request succeeds → replayed handoff code rejected with 401 → end → both `IMPERSONATION_STARTED` and `IMPERSONATION_ENDED` present in `/api/admin/audit-logs`.
- Subscription limits: invited staff up to the `growth`-tier cap of 10; the 11th invite correctly rejected with `PLAN_LIMIT_EXCEEDED` (403).
- Rate limiting: 20 login attempts succeed/fail normally (401), the 21st+ within the same 60s window returns 429.
- Secret redaction: live API log output inspected after real requests — `Authorization`, `Cookie`, and `Set-Cookie` headers all show `[redacted]`, confirmed via `pino-http` redact config (this session's fix — previously logged in plaintext on every request).
- Platform-host SEO isolation: `admin.localhost`/`app.localhost`/bare gateway host `/sitemap.xml` and `/robots.txt` correctly fall through to their own SPA (not storefront content); only the real tenant host serves storefront SEO data.
- Migration verification: existing dev database marked-applied against the committed baseline migration with zero drift; a freshly created empty database produces byte-identical schema via `prisma migrate deploy` (zero drift both directions, `prisma migrate diff --exit-code`).

## Security issues found / fixed (this pass)

| Issue | Action |
|-------|--------|
| `pino-http` logged `Authorization`/`Cookie`/`Set-Cookie` headers in plaintext on every request | Fixed — redact config added, verified live against real log output |
| Customer `passwordHash` returned to store-dashboard via un-`select`ed Prisma queries (customer list/detail, order detail, order-status-transition response) | Fixed — explicit field whitelist (`CUSTOMER_SAFE_SELECT`) applied everywhere `Customer` is queried outside the customer's own auth flow |
| `INVENTORY_MANAGER` could read orders/customers/support-tickets via direct API call despite the frontend hiding those nav items | Fixed — server-side `requireRoles` now matches the frontend RBAC map exactly |
| No rate limiting anywhere in `store.routes.ts`/`admin.routes.ts` (staff invite, coupon creation, payment approve/reject, impersonation start) | Fixed — rate limits added matching the sensitivity of each endpoint |
| Merchant-configurable footer links bypassed the CTA open-redirect sanitizer | Fixed — routed through the same `CtaLink`/`sanitizeInternalPath` used for hero/promo CTAs |
| Impersonation token-in-URL (prior architecture) | Fixed in an earlier pass — single-use, 60-second, server-side handoff-code exchange; re-verified live this pass |
| Seed script (`Admin123!`, demo stores) had no guard against running against a production database | Fixed — refuses to run when `NODE_ENV=production` unless explicitly opted in with `ALLOW_PROD_SEED=true` and a non-default `SEED_ADMIN_PASSWORD` |
| Login success/failure was not written to `AuditLog` at all (only a domain event, not persisted/queryable) | Fixed — `AUTH_LOGIN_SUCCESS`/`AUTH_LOGIN_FAILED` (with reason) now audit-logged |
| `CORS_ORIGINS`/`PLATFORM_DOMAIN` left at development defaults in production fails closed (breaks legitimate requests) rather than open, but silently — no signal to the operator | Fixed — loud `console.error` at production startup if either is still at its default |
| `react-router` 6.30.4 has 2 moderate CVEs (open redirect, SSR constructor injection) | Accepted risk, documented in SECURITY.md — SSR CVE inapplicable (no SSR anywhere in this stack), open-redirect CVE's only real vector (free-form theme/footer URLs) is closed at the code level; full audit of every `Link to=` call site performed, only static/server-validated-slug/sanitized-CTA paths remain |

Full detail, including the audit-log retention strategy and exactly when Redis becomes mandatory, is in [SECURITY.md](./SECURITY.md).

## Build results

- `@commercenest/types` — pass
- `@commercenest/api` — pass
- `@commercenest/admin-panel` — pass
- `@commercenest/store-dashboard` — pass
- `@commercenest/storefront` — pass
- `@commercenest/marketing` — pass

## Local run commands

```powershell
# From repo root
copy .env.example .env
npm install
npm run db:up            # embedded Postgres, no Docker required
npm run db:migrate        # applies the committed migration history
npm run db:seed

npm run dev               # API + all 3 frontends + gateway on http://localhost:8080

npm run test -w @commercenest/api
npm run test:e2e          # Playwright browser smoke test (requires `npm run dev` running)
npm run build              # all 6 workspaces
```

### Seed logins

- Master Admin: `admin@commercenest.com` / `Admin123!`
- TechWorld BD owner: `owner@techworld.bd` / `Owner123!`
- Storefront: `http://techworld-bd.localhost:8080` (via gateway) or `http://techworld-bd.commercenest.local` in a Docker Compose deploy

### Manual regression scripts (verified this pass, repeatable)

**COD + coupon + shipping**: storefront checkout with `paymentMethod: CASH_ON_DELIVERY` and an outside-Dhaka `deliveryAddress.division` → confirm `deliveryCharge` matches the store's `shippingOutsideDhaka` setting → `orders/lookup` to confirm tracking works.

**Manual bKash**: checkout with `paymentMethod: MANUAL_BKASH` (txn omitted) → `POST /payments/bkash` with a txn ID → Store Admin `POST /payments/bkash/approve` → confirm `paymentStatus: APPROVED`.

**Returns**: advance an order through `CONFIRMED → PROCESSING → SHIPPED → DELIVERED` → customer OTP login → `POST /account/returns` → staff `approve` → `receive` → `refund` → confirm order `paymentStatus: REFUNDED`.

**Impersonation**: Master Admin `POST /stores/:id/impersonate` → `POST /auth/impersonation/handoff` with the returned code → confirm the resulting token works for `/api/store/:storeId/*` → confirm re-using the same code returns 401 → `POST /admin/impersonate/:sessionId/end` → confirm both events in `/api/admin/audit-logs`.

## Remaining external configuration (required before a real launch, not before a pilot at small scale)

1. **Redis** — required once you run more than one API instance
2. **Cloudinary** — required before merchants rely on device media upload as their primary workflow
3. **SMTP** — required for customers to actually receive order/payment/return emails (architecture is complete; just needs credentials)
4. **Custom domain DNS/SSL** — no automation exists; manual provisioning per merchant custom domain

## Remaining known limitations

- SMS delivery is intentionally postponed (log-only)
- No CSRF token for cookie-based auth (mitigated by SameSite + CORS allowlist)
- `AuditLog` has no automated retention/archival (intentional at V1 scale — see SECURITY.md)
- `FormField`'s error text is now wired via `aria-describedby` (fixed this pass); no other outstanding accessibility gaps identified in this pass's review
