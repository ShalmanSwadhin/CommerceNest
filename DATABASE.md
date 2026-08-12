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

---

## Commerce extensions (returns, coupons, shipping)

| Model | Purpose |
|-------|---------|
| `Coupon` | Store-scoped discount code (percentage or fixed, min order, usage limits, expiry) |
| `CouponRedemption` | One row per order a coupon was applied to — enforces per-customer/total usage limits atomically inside the checkout transaction |
| `ReturnRequest` | Customer-initiated return/refund workflow: `REQUESTED → APPROVED/REJECTED → ITEM_RECEIVED → REFUNDED` |

Shipping is **not** a separate model — it's three fields on `Store` (`shippingInsideDhaka`, `shippingOutsideDhaka`, `freeShippingThreshold`) used to compute `Order.deliveryCharge` server-side at checkout from the delivery address's `division`. The client never sets `deliveryCharge`, `discountAmount`, or a coupon's discount value directly — all are computed in `storefront.service.ts#checkout` inside the order-creation transaction.

Additional uniqueness/constraint rules:

| Model | Constraint |
|-------|------------|
| `Coupon` | `@@unique([storeId, code])` |
| `CouponRedemption` | `@@unique` on `orderId` (one redemption per order) |

---

## Backup & recovery

CommerceNest's only stateful dependency is PostgreSQL (Redis is a cache/session store — safe to lose and rebuild). Everything below assumes the self-hosted `docker-compose.yml` Postgres container described in [DEPLOYMENT.md](./DEPLOYMENT.md); if you later move to a managed provider, prefer its native backups (see bottom of this section).

### 1. Automated daily backups (self-hosted Docker Postgres)

Add a small cron job on the host (not inside the container, so it survives container recreation) that runs `pg_dump` and rotates old copies:

```bash
#!/usr/bin/env bash
# /opt/commercenest/scripts/backup-db.sh — run nightly via cron
set -euo pipefail
STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR=/opt/commercenest/backups
mkdir -p "$BACKUP_DIR"

docker exec commercenest-postgres pg_dump -U commercenest -d commercenest --format=custom \
  > "$BACKUP_DIR/commercenest-$STAMP.dump"

# Keep the last 14 daily backups; ship older ones to off-host storage before this runs
# in production (rsync/S3/etc.) — local-disk-only backups don't survive a lost VPS.
find "$BACKUP_DIR" -name 'commercenest-*.dump' -mtime +14 -delete
```

```cron
# crontab -e (as a user with docker access)
0 2 * * * /opt/commercenest/scripts/backup-db.sh >> /var/log/commercenest-backup.log 2>&1
```

**Off-host copy is not optional** — a backup that lives on the same disk as the database is a backup that dies with the VPS. Sync `$BACKUP_DIR` to object storage (S3-compatible bucket, e.g. via `rclone` or `aws s3 sync`) as a second cron step, or point `pg_dump`'s output directly at a remote target.

### 2. Restore procedure

```bash
# Stop the API so nothing writes during restore
docker compose stop api

# Restore into a fresh database (never restore over a live one in place)
docker exec -i commercenest-postgres createdb -U commercenest commercenest_restore
docker exec -i commercenest-postgres pg_restore -U commercenest -d commercenest_restore \
  < /opt/commercenest/backups/commercenest-<STAMP>.dump

# Verify row counts / spot-check the restored data, then swap:
docker exec -i commercenest-postgres psql -U commercenest -c \
  "ALTER DATABASE commercenest RENAME TO commercenest_old;"
docker exec -i commercenest-postgres psql -U commercenest -c \
  "ALTER DATABASE commercenest_restore RENAME TO commercenest;"

docker compose up -d api
# Once confirmed healthy, drop commercenest_old
```

Restoring into a *new* database name first (rather than `pg_restore --clean` in place) means a bad restore never destroys the last-known-good data — you can always rename back.

### 3. What backups do **not** cover

- **Uploaded media**: if Cloudinary is configured, media already lives outside Postgres (Cloudinary has its own retention/backup) — nothing to do here. If running on the local/dev media stub, uploaded files are not durable and must not be relied on in production; configure Cloudinary before going live.
- **Redis**: intentionally not backed up — it holds refresh-token/session state and rate-limit counters. Losing it just logs everyone out and resets counters, not a data-loss event.

### 4. Managed Postgres providers

If CommerceNest moves off the self-hosted Docker Postgres to a managed provider (Neon, Supabase, RDS, Cloud SQL, etc.), use **that provider's built-in automated backups / point-in-time recovery** instead of the cron script above — they're continuous (not once-nightly), don't require host cron access, and are the supported path for those platforms. The `pg_dump` script in section 1 still has value even then, as a periodic portable export you control independently of the provider.

### 5. Practical test

A backup you've never restored is a hope, not a backup. Periodically (e.g. quarterly) actually run the restore procedure above against a throwaway database and confirm `npm run db:seed`-independent data (real orders/customers) comes back intact.
