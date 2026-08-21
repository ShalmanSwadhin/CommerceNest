# CommerceNest Design Decisions

Documented resolutions where the **master implementation prompt** diverged from the original **SRS** (Software Requirements Specification). The prompt takes precedence for V1 delivery.

---

## 1. Product naming: CommerceNest

| Source | Name |
|--------|------|
| SRS / early drafts | CommerceOS, CommercenesT |
| **Decision (V1)** | **CommerceNest** everywhere |

All user-facing copy, API health checks, package scopes (`@commercenest/*`), and documentation use **CommerceNest** exclusively. No CommerceOS references in code or docs.

---

## 2. Manual bKash as V1 primary payment

| Source | Position |
|--------|----------|
| SRS | Manual bKash reserved for V2; V1 payment TBD |
| **Master prompt** | Manual bKash is V1 primary |
| **Decision** | **Manual bKash implemented in V1** |

Implementation:

- Checkout accepts `MANUAL_BKASH`
- Customer submits txn via `POST /api/storefront/:slug/payments/bkash`
- Store staff approve/reject via store dashboard API
- `PaymentMethod.AUTOMATED_GATEWAY` enum exists but is not wired

---

## 3. Subdomain-based storefront URLs

| Source | Position |
|--------|----------|
| SRS alternative | Path-based routing (`/s/{slug}`) |
| **Master prompt** | Subdomain default |
| **Decision** | **`{slug}.commercenest.com`** |

- `StoreDomain` records seeded with `{slug}.{PLATFORM_DOMAIN}`
- Public API still uses slug param: `/api/storefront/:storeSlug/*`
- Custom domains supported in schema; DNS automation deferred

---

## 4. Theme editing: Master Admin owned in V1

| Source | Position |
|--------|----------|
| SRS | Store admins may edit themes |
| **Master prompt** | Master Admin owns theme in V1 |
| **Decision** | **Master Admin edits; Store Admin read-only** |

- Draft/publish/restore: `/api/admin/stores/:id/theme/*`
- Store dashboard `ThemePage` displays published theme with info alert — no edit controls
- Store staff can still manage CMS blocks and business settings

---

## 5. Cash on Delivery alongside bKash

| Source | Position |
|--------|----------|
| Some SRS drafts | bKash-only V1 |
| **Decision** | **COD + Manual bKash both active** |

- Checkout schema allows `CASH_ON_DELIVERY` and `MANUAL_BKASH`
- COD flow includes phone confirmation (`confirm-cod` endpoint)
- Seed includes both payment types

---

## 6. Redis optional with in-memory fallback

| Source | Position |
|--------|----------|
| SRS | Redis required for production |
| **Master prompt** | Optional for local/dev |
| **Decision** | **Graceful fallback to in-memory Map** |

`apps/api/src/lib/redis.ts`:

- If `REDIS_URL` unset or connection fails → memory store
- Used for refresh tokens, rate limits, OTP
- **Production multi-instance deployments must use real Redis** — memory fallback is not shared across processes

Health endpoint reports `redis: "memory-fallback"` when applicable.

---

## 7. Plugin / white-label architecture (V3+, not built)

| Source | Position |
|--------|----------|
| SRS long-term | Plugin marketplace, white-label resellers |
| **Decision** | **Documented only — no V1 implementation** |

Present in design:

- `FeatureFlag` with `storeOverrides` JSON
- `PlatformSettings` key/value store
- `Template` model for theme sharing
- Event catalog extensibility

Not built:

- Plugin loader / sandbox
- White-label billing portals
- Third-party app registry

Target: V3+ when core platform is stable.

---

## 8. Additional implicit decisions

| Topic | Decision |
|-------|----------|
| ORM | Prisma on PostgreSQL |
| API style | REST JSON (not GraphQL) |
| Frontends | Three separate Vite SPAs |
| Customer auth | Phone OTP (not email/password) |
| Staff auth | Email + password + JWT |
| Bangladesh focus | Phone regex `01[3-9]########`, locale `bn` default |
| Media | Cloudinary optional with stub fallback |
| SMS | Log-only stub when provider unset |
| Migrations | Committed history (`packages/prisma/migrations/`), `migrate deploy` in production; expand-first for live-data changes |
| Brand in health | `"brand": "CommerceNest"` |

---

## 9. Courier integration: Steadfast first, one provider only (Phase 6)

| Source | Position |
|--------|----------|
| Brief | Build the courier abstraction once, integrate one real provider well rather than three shallowly |
| **Decision** | **Steadfast Courier only in V1** — chosen over Pathao/RedX for static API-key/secret-key auth (no OAuth refresh flow, no multi-day merchant-approval process blocking integration on an external non-technical dependency) |

Also scoped out of V1, deliberately:

- Shipment cancellation — Steadfast's public API has no merchant-facing cancel endpoint
- COD settlement/reconciliation accounting — the brief explicitly excluded this unless the chosen provider made it easy; Steadfast's public API doesn't expose a remittance feed
- A second/third courier — the `CourierProvider` abstraction supports one, but only one ships now

Full rationale and the abstraction's design: [COURIER_ARCHITECTURE.md](./COURIER_ARCHITECTURE.md).

---

## Decision log maintenance

When SRS and product direction conflict again:

1. Record the conflict here with date and rationale
2. Note which source won (prompt vs SRS)
3. Link to implementing PR or file paths
4. Update affected docs (API, ARCHITECTURE, README)
