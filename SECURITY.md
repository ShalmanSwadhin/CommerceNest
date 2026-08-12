# CommerceNest Security

Security model for CommerceNest V1 multi-tenant SaaS.

## Tenant isolation

### Core rule: never trust client `storeId`

- JWT access token carries the **authoritative** `storeId` for store staff
- URL path `/api/store/:storeId/*` is validated against the token in `requireStoreScope`
- Request body, query string, or headers must **never** override tenant scope for authorization
- Services use `storeId` from `req.storeId` (set by middleware), not from client input

### Cross-store access

Non–Master Admin users attempting another store's path receive:

```json
{
  "error": {
    "code": "TENANT_MISMATCH",
    "message": "Cross-store access denied — path storeId does not match session"
  }
}
```

Integration test: `apps/api/src/app.test.ts` — Store A token cannot read Store B products.

### Resource-level checks

Services call `assertStoreMatch(resource.storeId, scopedStoreId)` when loading by ID to prevent IDOR even if path storeId is valid.

### Storefront isolation

Public routes resolve store by **slug** only. Customers cannot access another store's data by guessing CUIDs — all queries include `storeId` from slug resolution.

### Suspended stores

`Store.status === SUSPENDED` blocks store staff API access. Master Admin retains access for support and impersonation.

---

## Password hashing

- Algorithm: **bcrypt** (`bcryptjs`)
- Staff passwords hashed on invite accept, reset, and seed
- Customer passwords optional (OTP-primary); hashed when set
- Invite and reset tokens stored as hashes (`inviteTokenHash`), not plaintext

---

## JWT authentication

### Access token

- Signed with `JWT_ACCESS_SECRET`
- TTL: 15 minutes (configurable via `JWT_ACCESS_TTL`)
- Claims: `sub` (user ID), `role`, `storeId`, optional `impersonationSessionId`
- Verified on every protected request; user re-loaded from DB to check `ACTIVE` status

### Refresh token

- Signed with `JWT_REFRESH_SECRET`
- Contains `jti` (unique ID)
- `jti` → user ID mapping stored in **Redis** (7-day TTL)
- Logout deletes `jti` from Redis — token cannot be reused
- Rotation on refresh issues new pair

### Delivery

- JSON response body (for SPA Bearer auth)
- `httpOnly` cookies (`accessToken`, `refreshToken`) with `sameSite: lax`
- Production: set `COOKIE_SECURE=true`

---

## Rate limiting

Implemented via Redis/memory counter (`kvIncr`) in `middleware/rateLimit.ts`:

| Endpoint | Limit |
|----------|-------|
| `POST /api/auth/login` | 20 requests / minute / IP |
| `POST /api/auth/refresh` | 60 / minute / IP |
| `POST /api/auth/password/reset-request` | 10 / minute / IP |
| `POST /api/auth/password/reset-confirm` | 20 / minute / IP |
| `POST /api/auth/invite/accept` | 20 / minute / IP |
| `POST /api/auth/impersonation/handoff` | 20 / minute / IP |
| `POST /api/storefront/:slug/checkout` | 30 / minute / IP |
| `POST /api/storefront/:slug/payments/bkash` | 30 / minute / IP |
| `POST /api/storefront/:slug/orders/lookup` | 30 / minute / IP |
| `POST /api/storefront/:slug/auth/otp/request` | 10 / minute / IP |
| `POST /api/storefront/:slug/auth/otp/verify` | 20/min/IP **and** 8/10min/phone (brute-force-resistant on the 6-digit code independent of IP rotation) |
| `POST /api/storefront/:slug/account/returns` | 10 / minute / IP |
| `GET` storefront catalog (products/categories/home/product detail/CMS) | 120 / minute / IP |
| `POST /api/store/:id/staff/invite` | 10 / minute / IP |
| `POST /api/store/:id/coupons` | 20 / minute / IP |
| `POST /api/store/:id/payments/bkash/approve\|reject` | 30 / minute / IP |
| `POST /api/admin/stores/:id/impersonate` | 20 / minute / IP |
| `POST /api/admin/payments/:orderId/approve\|reject` | 30 / minute / IP |

Exceeded limits return `429` with code `RATE_LIMITED`.

---

## Audit log

All sensitive actions write to `AuditLog`:

- Actor ID, role, IP, user agent
- Action code (e.g. `PLATFORM_SETTINGS_UPDATED`, payment approvals)
- Target type/ID, optional `storeId`
- Linked `impersonationSessionId` when applicable

Master Admin can query via `GET /api/admin/audit-logs`.

Audit entries emit `AuditLogWritten` domain events.

---

## Impersonation

Master Admin can impersonate store context:

1. `POST /api/admin/stores/:id/impersonate` creates `ImpersonationSession` and mints a random single-use **handoff code** (`impersonation.service.ts`), stored server-side (KV, 60s TTL) mapped to the real access/refresh tokens — the API response contains only the opaque code, never the tokens.
2. Admin-panel opens `app.<domain>/?impersonation_handoff=<code>` in a new tab. It does **not** put tokens in the URL, and does not mark its own session as impersonating (the admin's own tab stays a normal Master Admin session).
3. Store-dashboard detects `?impersonation_handoff=`, strips it from the URL immediately, and calls `POST /api/auth/impersonation/handoff` with the code in the request body to exchange it for the real `{ accessToken, refreshToken }`. The code is deleted server-side on first read (`kvGet` + `kvDel`) — a replayed/stolen code fails with 401 after first use or after 60 seconds, whichever comes first.
4. The resulting access token carries `role: MASTER_ADMIN`, the target `storeId`, and `impersonationSessionId` — all server-set, never client-supplied.
5. `POST /api/admin/impersonate/:sessionId/end` restores a clean Master Admin token (no store scope) and writes `IMPERSONATION_ENDED` to the audit log; starting a session writes `IMPERSONATION_STARTED`.
6. A Master Admin who calls `/api/store/:storeId/*` directly (bypassing impersonation entirely — allowed, since Master Admin has platform-wide access by design) has every **mutating** request logged as `MASTER_ADMIN_DIRECT_STORE_WRITE` in `requireStoreScope`, so direct-access writes still leave an audit trail even without a formal impersonation session.

**Verified end-to-end** (manual regression against a live dev stack): start → handoff exchange → impersonated request succeeds → replayed handoff code rejected (401) → end → both `IMPERSONATION_STARTED` and `IMPERSONATION_ENDED` present in `/api/admin/audit-logs`.

### UI requirement: impersonation banner

When impersonation is active, the UI **must** display a persistent banner:

- Store dashboard (`apps/store-dashboard/src/components/layout/ImpersonationBanner.tsx`) shows "You are viewing as staff for {store}" with an "End impersonation" control, mounted in `AppLayout`.
- Admin-panel's own `ImpersonationBanner.tsx`/`impersonation` auth-store slice exist but are **not** triggered by starting impersonation (fixed — previously the admin's own dashboard incorrectly showed itself as "impersonating"; only the destination store-dashboard tab reflects the impersonated session now).

Never hide impersonation state — operators must always know they are not in their native role.

---

## HTTP hardening

- **Helmet** — default security headers
- **CORS** — explicit origin allowlist with credentials
- **Trust proxy** — enabled for reverse-proxy deployments
- **Request ID** — correlation via `requestId` middleware
- **Input validation** — Zod schemas on all write endpoints
- **JSON body limit** — 2 MB

---

## OTP (storefront customers)

- 6-digit code, 10-minute TTL in Redis
- Rate limited on both request and verify endpoints (verify is limited per-IP **and** per-phone — see rate limiting table — so the 6-digit space can't be brute-forced by rotating IPs)
- **`devCode`/`devToken`/dev invite tokens returned only when `NODE_ENV === 'development'`** (tightened from `!== 'production'`, which would have also leaked in a `staging`/`test`-labeled deployment) — must not leak in prod

---

## Secrets management

| Secret | Storage |
|--------|---------|
| JWT secrets | Environment variables only |
| Database URL | Environment variables |
| Cloudinary keys | Environment variables |
| Refresh token JTIs | Redis (revocable) |

Never commit `.env`. Rotate JWT secrets on compromise (invalidates all sessions).

---

## Known dependency vulnerabilities (accepted risk, documented)

`npm audit` reports 2 moderate advisories against `react-router`/`react-router-dom` 6.30.4 (affects the 6.0.0–7.17.0 range):

- **Open redirect via backslash in `<Link>`/`useNavigate`** (GHSA-wrjc-x8rr-h8h6)
- **Arbitrary constructor injection via `deserializeErrors()` in SSR hydration** (GHSA-337j-9hxr-rhxg)

**Decision: postponed, not silently ignored.** Fixing requires a react-router 6→7 major upgrade with breaking API changes across all four frontend apps — out of proportion to the actual exposure here, which we've verified and closed at the code level instead:

- The SSR-hydration CVE **does not apply** — none of the four apps (`admin-panel`, `store-dashboard`, `storefront`, `marketing`) use server-side rendering; all are client-rendered Vite SPAs.
- The open-redirect CVE requires a backslash-prefixed value reaching `<Link to>`/`navigate()`. We audited every dynamic `Link to={...}` call site across all three tenant-facing apps: the only free-form, merchant-configurable URLs are Theme Builder CTA hrefs (hero/promo banner buttons) and storefront footer links — both now routed through `apps/storefront/src/lib/ctaLink.tsx`, which strips leading backslashes, forces a single leading `/` on internal paths, and renders genuine `http(s)://` URLs as plain `<a>` tags instead of a react-router `Link` (so they're not subject to react-router's own URL parsing at all). Every other `Link to=` usage found in the audit uses either a static string or a value built from a server-validated slug (`STORE_SLUG_REGEX`/`PRODUCT_SLUG_REGEX`, alphanumeric+hyphen only) — never raw free text.
- Re-run this audit (`npm audit`) after any future dependency bump, and re-open the react-router upgrade if a new advisory lands that isn't covered by the same mitigation.

---

## Production recommendations

1. Require Redis — do not use in-memory fallback with multiple API instances
2. Strong random JWT secrets (≥ 32 characters)
3. HTTPS everywhere; `COOKIE_SECURE=true`
4. Restrict Postgres/Redis to private network
5. Run API as non-root user (Dockerfile uses `cn` user)
6. Enable DB connection pooling appropriate to load
7. Monitor audit logs for impersonation and cross-tenant attempts
8. Add WAF / reverse proxy rate limiting in front of API

---

## Known V1 gaps

- No CSRF token for cookie-based auth (mitigated by SameSite + CORS allowlist; consider CSRF for strict cookie mode)
- Custom domain DNS verification is stubbed
- Automated gateway webhooks not implemented
- No field-level encryption for PII at rest
- react-router moderate CVEs — accepted risk, see "Known dependency vulnerabilities" above
- Device media uploads fall back to base64 data URLs in Postgres without Cloudinary configured — fine for dev, not for production (see [ENVIRONMENT.md](./ENVIRONMENT.md#media-cloudinary))
- `FormField`'s error message (`role="alert"`) isn't wired to its input via `aria-describedby` — screen readers still announce it (live region), but the input itself isn't formally associated with the error text
- No committed audit-log retention/archival policy — `AuditLog` grows unbounded; fine at V1 scale, revisit before it matters operationally

Resolved since the original overnight build (see git history / `PRODUCTION_READINESS_REPORT.md` for the point-in-time state before this pass): announcements/support RBAC (now enforced server-side per role, including the merchant↔platform support-ticket routes), customer `passwordHash` leakage into store-dashboard responses (fixed — explicit field whitelist on every `Customer` query), impersonation token-in-URL (replaced with the single-use handoff-code exchange above), Prisma migration history (previously `db push`-only bootstrap, now committed migrations — see [DATABASE.md](./DATABASE.md#migrations)).

See [OVERNIGHT_IMPLEMENTATION_REPORT.md](./OVERNIGHT_IMPLEMENTATION_REPORT.md) for the original build's starting point.
