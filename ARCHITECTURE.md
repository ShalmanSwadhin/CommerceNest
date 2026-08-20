# CommerceNest Architecture

## Monorepo structure

CommerceNest is an npm workspaces monorepo. Shared code lives in `packages/`; deployable apps in `apps/`.

### Apps

| Package | Purpose | Stack | Dev port |
|---------|---------|-------|----------|
| `@commercenest/api` | REST API, auth, business logic | Express 4, Prisma, Zod, Pino | 4000 |
| `@commercenest/admin-panel` | Platform Master Admin | React 18, Vite, TanStack Query, Zustand | 5173 |
| `@commercenest/store-dashboard` | Store operator dashboard | React 18, Vite, TanStack Query, Zustand | 5174 |
| `@commercenest/storefront` | Customer shopping experience | React 18, Vite, react-helmet-async | 5175 |

### Packages

| Package | Purpose |
|---------|---------|
| `@commercenest/prisma` | PostgreSQL schema (`schema.prisma`), generated Prisma client |
| `@commercenest/types` | Domain enums, Zod validation schemas, domain event types |
| `@commercenest/ui` | Shared React UI primitives (Button, Card, Table, Alert, tokens) |

Build order: `types` → `prisma generate` → `api` → frontends (each imports `types` and `ui`).

## Multi-tenancy

### Tenant key: `storeId`

Every tenant-owned entity (products, orders, customers, categories, media, CMS blocks, etc.) includes a `storeId` foreign key. Services receive `storeId` from middleware — never from unvalidated client body fields.

### Subdomain resolution

Each store gets a primary subdomain record in `StoreDomain`:

```
{store.slug}.{PLATFORM_DOMAIN}
```

Example (local): `techworld-bd.commercenest.local`

Custom domains are stored in the same table with `type: CUSTOM`. DNS verification is stubbed — records can be created but automated SSL/DNS provisioning is not implemented in V1.

### Route-level isolation

| Route prefix | Tenant resolution |
|--------------|-------------------|
| `/api/admin/*` | Platform scope (Master Admin only) |
| `/api/store/:storeId/*` | Path `storeId` must match JWT `storeId` (except Master Admin) |
| `/api/storefront/:storeSlug/*` | Resolved from slug → store row (public, no staff auth) |

Middleware `requireStoreScope` enforces:

1. Non–Master Admin users: `req.user.storeId === params.storeId`
2. Master Admin with impersonation: impersonation session store must match path
3. Suspended stores block non–Master Admin access

## Three frontends

### Master Admin (`admin-panel`)

- Store lifecycle (create, suspend, reactivate, archive)
- Platform analytics and audit log viewer
- **Theme editor** — draft, publish, version restore (V1 owner)
- Impersonation into store context
- Platform settings, announcements, support (lightweight UI)

### Store dashboard (`store-dashboard`)

- Products, categories, orders, customers
- Manual bKash payment queue (approve/reject)
- COD call confirmation
- Business settings (bKash number, instructions)
- Media library, CMS blocks
- **Theme settings — read-only** in V1
- Analytics summary

### Storefront (`storefront`)

- Themed home, category, product pages
- Cart and checkout (COD or MANUAL_BKASH)
- bKash payment submission after checkout
- Order tracking (order number + phone)
- Customer OTP auth (phone-based, dev returns code)

Storefront reads published theme JSON from the API and applies `themeSettings` (colors, fonts) via CSS variables.

**Stock is reserved at CONFIRMED, not at checkout.** Placing an order (PENDING) never touches `Variant.stock` — checkout only checks stock is currently sufficient, as a courtesy rejection. The actual reservation happens when staff transitions an order to CONFIRMED (`order.service.ts#transitionOrderStatus`), via an atomic conditional `updateMany` (`stock >= quantity` in the WHERE clause, `decrement` in the SET) rather than a read-then-write — this is what makes two staff confirming two orders for the same last unit resolve to exactly one success instead of both succeeding. Stock is restored symmetrically whenever a reservation is undone before the customer actually received the item: CONFIRMED→CANCELLED, SHIPPED→RETURNED (refused/undelivered), and a post-delivery return's `markItemReceived` step (the point the item is physically confirmed back, not automatically on refund). This deliberately mirrors how a phone-confirmed COD business actually works: PENDING is customer intent, CONFIRMED is the real sale.

## API service layer

Business logic lives in `apps/api/src/services/`:

| Service | Responsibility |
|---------|----------------|
| `auth.service` | Login, refresh, logout, invite, password reset |
| `store.service` | CRUD, suspend, business settings |
| `product.service` / `category.service` | Catalog |
| `order.service` | Status transitions, COD confirm, courier |
| `payment.service` | bKash submit, approve, reject |
| `customer.service` / `customer-risk.service` | Customers, risk scoring |
| `storefront.service` | Public catalog, checkout, OTP |
| `theme.service` | Draft/publish/restore versions |
| `domain.service` | Subdomain + custom domain records |
| `media.service` | Cloudinary signed uploads (graceful stub) |
| `analytics.service` | Platform and store KPIs |
| `audit.service` | Immutable audit log writes |
| `impersonation.service` | Master Admin store impersonation |

Routes are thin: validate input (Zod), call service, return JSON. Errors use a consistent `{ error: { code, message } }` envelope.

## Domain events

In-process event bus (`apps/api/src/events/`):

- `emit.ts` — `emitAfterCommit()` fires after DB writes
- `subscribers.ts` — logs events, stub SMS notifications

Event catalog defined in `packages/types/src/events.ts` (OrderPlaced, PaymentApproved, StoreThemePublished, AuditLogWritten, etc.). Failed async handlers can be recorded in `EventFailureLog` (table exists; full retry worker not built).

Events are synchronous in V1 — no external message broker. Redis is used for sessions/rate limits, not event streaming.

## Authentication

### Staff (admin-panel + store-dashboard)

- **Access token:** JWT, 15-minute TTL, contains `sub`, `role`, `storeId`, optional `impersonationSessionId`
- **Refresh token:** JWT with `jti`, stored in Redis (or in-memory fallback) for 7 days
- Tokens delivered via JSON body and `httpOnly` cookies
- Password hashing: bcrypt

### Storefront customers

- OTP via phone (`/auth/otp/request`, `/auth/otp/verify`)
- OTP stored in Redis/memory with 10-minute TTL
- Dev mode returns `devCode` in response

### Impersonation

Master Admin starts impersonation → new access token with target `storeId` + `impersonationSessionId`. All actions audit-logged. UI must show **ImpersonationBanner** (implemented in admin-panel; store-dashboard should mirror when impersonating).

## Theme draft / publish

```
Storefront (1:1 Store)
  ├── draftVersionId  → StorefrontVersion (status: DRAFT)
  └── publishedVersionId → StorefrontVersion (status: PUBLISHED)
```

Flow:

1. Master Admin edits draft via `PUT /api/admin/stores/:id/theme/draft`
2. Publish via `POST /api/admin/stores/:id/theme/publish` — marks draft as PUBLISHED, updates pointer
3. Restore old version → creates new draft from historical version
4. Store dashboard reads via `GET /api/store/:storeId/theme/current` (read-only)

Each `StorefrontVersion` stores `layout` (JSON sections) and `themeSettings` (JSON tokens).

## Request flow (store-scoped)

```
Client → requireAuth → requireRoles → requireStoreScope → Service(storeId)
                                              │
                                              ├─ Validates path storeId
                                              ├─ Sets req.storeId
                                              └─ Blocks cross-tenant access
```

## Future architecture (documented, not built)

- Plugin / white-label module system (V3+)
- Automated payment gateway webhooks
- External event bus (Redis Streams / SQS)
- Real DNS + SSL automation for custom domains

See [DECISIONS.md](./DECISIONS.md) for scope choices.
