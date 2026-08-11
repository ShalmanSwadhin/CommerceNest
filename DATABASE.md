# CommerceNest Database

PostgreSQL schema managed by Prisma (`packages/prisma/schema.prisma`). All tenant tables include `storeId` for isolation.

## Entity overview

### Platform identity

| Model | Purpose |
|-------|---------|
| `User` | Staff accounts (Master Admin + store roles) |
| `PlatformSettings` | Key/value platform config |
| `FeatureFlag` | Global + per-store feature toggles |
| `Announcement` | Platform announcements |
| `SupportTicket` / `SupportReply` | Store ↔ platform support |

### Store & domains

| Model | Purpose |
|-------|---------|
| `Store` | Tenant root — name, slug, status, bKash config, plan |
| `StoreDomain` | Subdomain and custom hostname records |
| `Storefront` | Links store to draft/published theme versions |
| `StorefrontVersion` | Versioned layout + themeSettings JSON |
| `Template` | Reusable theme templates (Master Admin) |

### Customers

| Model | Purpose |
|-------|---------|
| `Customer` | Store-scoped shopper (phone is login identity) |
| `CustomerAddress` | Saved delivery addresses |

### Catalog

| Model | Purpose |
|-------|---------|
| `Category` | Hierarchical categories per store |
| `Product` | Product with JSON image list, SEO fields |
| `Variant` | SKU, stock, optional price override |

### Orders

| Model | Purpose |
|-------|---------|
| `Order` | Order header, payment, delivery, courier |
| `OrderItem` | Line items (denormalized product names) |
| `OrderStatusHistory` | Audit trail of status transitions |

### Media & CMS

| Model | Purpose |
|-------|---------|
| `MediaAsset` | Cloudinary-backed file metadata |
| `CmsContentBlock` | Keyed JSON content blocks per store |

### Security & ops

| Model | Purpose |
|-------|---------|
| `AuditLog` | Immutable action log |
| `ImpersonationSession` | Master Admin impersonation tracking |
| `Notification` | In-app notifications |
| `EventFailureLog` | Failed domain event handler records |

---

## Key indexes

Indexes support tenant-scoped queries and admin dashboards:

| Table | Index | Use case |
|-------|-------|----------|
| `users` | `storeId`, `role`, `status` | Staff listing |
| `stores` | `status`, `ownerUserId` | Admin store filters |
| `customers` | `(storeId, phone)` unique | Login / lookup |
| `customers` | `(storeId, riskLevel)` | Risk filtering |
| `products` | `(storeId, status)`, `(storeId, slug)` unique | Catalog |
| `variants` | `(storeId, sku)` unique | Inventory |
| `orders` | `(storeId, status)`, `(storeId, paymentStatus)` | Ops queues |
| `orders` | `(storeId, orderNumber)` unique | Order lookup |
| `audit_logs` | `(storeId, createdAt)`, `(actorId, createdAt)` | Compliance |
| `storefront_versions` | `(storeId, status)` | Theme management |

---

## Tenant uniqueness rules

Composite unique constraints enforce per-store uniqueness:

| Model | Constraint | Fields |
|-------|------------|--------|
| `Customer` | `@@unique([storeId, phone])` | Phone unique within store |
| `Category` | `@@unique([storeId, slug])` | URL slug per store |
| `Product` | `@@unique([storeId, slug])` | Product slug per store |
| `Variant` | `@@unique([storeId, sku])` | SKU per store |
| `Order` | `@@unique([storeId, orderNumber])` | Order number per store |
| `MediaAsset` | `@@unique([storeId, publicId])` | Cloudinary ID per store |
| `CmsContentBlock` | `@@unique([storeId, key])` | CMS key per store |
| `StorefrontVersion` | `@@unique([storefrontId, versionNumber])` | Version sequence |

**Global uniques:** `User.email`, `Store.slug`, `StoreDomain.hostname`.

---

## Payment enums

### `PaymentMethod`

| Value | V1 status |
|-------|-----------|
| `CASH_ON_DELIVERY` | **Active** — checkout + COD call confirmation |
| `MANUAL_BKASH` | **Primary** — checkout, customer submits Txn ID, staff approve/reject |
| `AUTOMATED_GATEWAY` | Reserved — enum exists, not implemented |

Checkout schema (`packages/types`) only accepts `CASH_ON_DELIVERY` and `MANUAL_BKASH`.

### `PaymentStatus`

| Value | Meaning |
|-------|---------|
| `PENDING` | Awaiting payment (COD or bKash not yet submitted) |
| `PENDING_VERIFICATION` | Customer submitted bKash details; staff must verify |
| `APPROVED` | bKash manually approved (`isPaid: true`) |
| `REJECTED` | bKash rejected; customer may resubmit |
| `REFUNDED` | Reserved |
| `CANCELLED` | Payment cancelled |

### bKash fields on `Order`

| Column | Purpose |
|--------|---------|
| `bkashTxnId` | Customer-provided transaction ID |
| `bkashSenderPhone` | Sender bKash number |
| `bkashAmount` | Amount sent |
| `bkashNote` | Optional note |
| `paymentVerifiedAt` | Approval timestamp |
| `paymentVerifiedById` | Staff user who approved/rejected |

### COD fields on `Order`

| Column | Purpose |
|--------|---------|
| `codConfirmedByCall` | Staff confirmed order by phone |
| `codCallNote` | Call notes |
| `callAttempts` | Number of call attempts |

---

## Customer risk fields

### `CustomerRiskLevel` enum

| Level | Meaning |
|-------|---------|
| `NONE` | Normal customer |
| `CAUTION` | ≥ 2 refused orders, refusal rate ≤ 40% |
| `HIGH_RISK` | ≥ 2 refused orders AND refusal rate > 40% |

### Counter fields on `Customer`

| Field | Updated when |
|-------|--------------|
| `totalOrders` | Order reaches terminal state (delivered/returned) |
| `deliveredOrders` | Order delivered |
| `refusedOrders` | Order returned/refused |

Risk is recalculated in `customer-risk.service.ts` on `DELIVERED` and `RETURNED` transitions. Displayed at checkout placement (`OrderPlaced` event includes `riskLevelAtPlacement`).

---

## Order status enum

```
PENDING → CONFIRMED → PROCESSING → SHIPPED → DELIVERED
                                              ↘ RETURNED
         ↘ CANCELLED (from several states)
```

Valid transitions enforced by `order-state-machine` (see unit tests).

---

## Store status enum

| Status | Effect |
|--------|--------|
| `PENDING_SETUP` | New store, not yet live |
| `ACTIVE` | Normal operation |
| `SUSPENDED` | Blocks store staff API access |
| `ARCHIVED` | Soft-deleted / inactive |

---

## Migrations

V1 bootstrap uses `prisma db push` when no migration history exists:

```bash
npm run db:push
```

For production, adopt **expand-first** migrations:

1. Add nullable columns / new tables
2. Deploy code that reads both old and new
3. Backfill data
4. Deploy code that writes new only
5. Remove old columns in a later migration

See [DEPLOYMENT.md](./DEPLOYMENT.md).

---

## Seed data

`npm run db:seed` creates:

- 1 Master Admin
- 3 active stores with products, categories, subdomains, published themes
- Customers at NONE / CAUTION / HIGH_RISK tiers
- Sample orders: pending bKash, pending COD, delivered bKash
