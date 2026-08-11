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
| `POST /api/auth/password/reset-request` | 10 / minute / IP |
| `POST /api/storefront/:slug/checkout` | 30 / minute / IP |
| `POST /api/storefront/:slug/auth/otp/request` | 10 / minute / IP |

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

1. `POST /api/admin/stores/:id/impersonate` creates `ImpersonationSession`
2. New access token includes target `storeId` + `impersonationSessionId`
3. All actions during session should link to session in audit log

### UI requirement: impersonation banner

When impersonation is active, the UI **must** display a persistent banner:

- Implemented in `admin-panel` → `ImpersonationBanner.tsx`
- Shows store name/ID and "End impersonation" control
- Uses distinct visual treatment (`Alert tone="impersonation"`)
- Store dashboard should show equivalent banner when impersonating from admin

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
- Rate limited on request endpoint
- **`devCode` returned only when `NODE_ENV !== 'production'`** — must not leak in prod

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
- Announcements/support lack full RBAC hardening

See [OVERNIGHT_IMPLEMENTATION_REPORT.md](./OVERNIGHT_IMPLEMENTATION_REPORT.md).
