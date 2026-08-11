# CommerceNest API Reference

Base URL: `http://localhost:4000` (development)

All authenticated routes accept:
- `Authorization: Bearer <accessToken>` header, or
- `accessToken` / `refreshToken` httpOnly cookies (set on login)

Error envelope:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable message",
    "details": {}
  }
}
```

Common codes: `UNAUTHORIZED`, `FORBIDDEN`, `TENANT_MISMATCH`, `NOT_FOUND`, `VALIDATION_ERROR`, `CONFLICT`, `RATE_LIMITED`.

---

## Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/health` | None | Service health, DB and Redis status |

---

## `/api/auth` — Staff authentication

| Method | Path | Rate limit | Description |
|--------|------|------------|-------------|
| POST | `/api/auth/login` | 20/min | Email + password login. Returns user + tokens. |
| POST | `/api/auth/refresh` | — | Rotate access token using refresh token |
| POST | `/api/auth/logout` | — | Revoke refresh token |
| POST | `/api/auth/password/reset-request` | 10/min | Request password reset email/token |
| POST | `/api/auth/password/reset-confirm` | — | Confirm reset with token + new password |
| POST | `/api/auth/invite/accept` | — | Accept staff invite, set password |

### Login body

```json
{
  "email": "admin@commercenest.com",
  "password": "Admin123!"
}
```

---

## `/api/admin` — Master Admin

**Requires:** `MASTER_ADMIN` role

### Stores

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/stores` | List stores (`?status`, `?search`, `?page`, `?limit`) |
| POST | `/api/admin/stores` | Create store + owner invite |
| GET | `/api/admin/stores/:id` | Store detail |
| POST | `/api/admin/stores/:id/suspend` | Suspend (`{ "reason": "..." }`) |
| POST | `/api/admin/stores/:id/reactivate` | Reactivate |
| POST | `/api/admin/stores/:id/archive` | Archive |

### Domains

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/stores/:id/domains` | List domains |
| POST | `/api/admin/stores/:id/domains` | Add custom domain |

### Analytics & audit

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/analytics/summary` | Platform KPIs |
| GET | `/api/admin/audit-logs` | Audit log (`?storeId`, `?action`, `?page`) |

### Impersonation

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/admin/stores/:id/impersonate` | Start impersonation session |
| POST | `/api/admin/impersonate/:sessionId/end` | End session |

### Theme (Master Admin owned)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/stores/:id/theme` | Current draft + published theme |
| PUT | `/api/admin/stores/:id/theme/draft` | Save draft layout/settings |
| POST | `/api/admin/stores/:id/theme/publish` | Publish draft to live |
| GET | `/api/admin/stores/:id/theme/versions` | Version history |
| POST | `/api/admin/stores/:id/theme/versions/:versionId/restore` | Restore version to draft |

### Platform settings

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/settings` | List settings |
| PUT | `/api/admin/settings/:key` | Upsert setting |

---

## `/api/store/:storeId` — Store staff

**Requires:** Store staff role + `storeId` path matches JWT `storeId`

Roles: `STORE_OWNER`, `STORE_MANAGER`, `INVENTORY_MANAGER`, `ORDER_MANAGER`, `CUSTOMER_SUPPORT`, `MASTER_ADMIN`

### Products

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | `/products` | All staff | List products |
| POST | `/products` | Owner, Manager, Inventory | Create product |
| GET | `/products/:productId` | All staff | Product detail |
| PATCH | `/products/:productId` | Owner, Manager, Inventory | Update |
| POST | `/products/:productId/archive` | Owner, Manager, Inventory | Archive |

### Categories

| Method | Path | Description |
|--------|------|-------------|
| GET | `/categories` | List |
| POST | `/categories` | Create |
| PATCH | `/categories/:categoryId` | Update |
| DELETE | `/categories/:categoryId` | Delete |

### Orders

| Method | Path | Description |
|--------|------|-------------|
| GET | `/orders` | List (`?status`, `?paymentStatus`, pagination) |
| GET | `/orders/:orderId` | Detail with items + customer |
| POST | `/orders/:orderId/status` | Transition status |
| POST | `/orders/:orderId/confirm-cod` | Record COD phone confirmation |
| PATCH | `/orders/:orderId/courier` | Set courier name/tracking |

### Customers

| Method | Path | Description |
|--------|------|-------------|
| GET | `/customers` | List with risk levels |
| GET | `/customers/:customerId` | Detail + order history |

### Payments — Manual bKash (primary V1 flow)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/payments/pending-bkash` | Queue of orders awaiting verification |
| POST | `/payments/bkash/approve` | Approve submitted bKash payment |
| POST | `/payments/bkash/reject` | Reject with optional reason |

#### Approve body

```json
{
  "orderId": "clxxxxxxxxxxxxxxxx",
  "note": "Verified in bKash app"
}
```

#### Reject body

```json
{
  "orderId": "clxxxxxxxxxxxxxxxx",
  "note": "Txn ID not found"
}
```

Sets `paymentStatus` to `APPROVED` or `REJECTED`, records verifier, emits `PaymentApproved` event on approve.

### Analytics, media, settings

| Method | Path | Description |
|--------|------|-------------|
| GET | `/analytics/summary` | Store KPIs |
| GET | `/media` | Media library |
| POST | `/media/signed-url` | Cloudinary upload signature |
| POST | `/media` | Register uploaded asset |
| DELETE | `/media/:mediaId` | Delete asset |
| GET | `/settings/business` | Store business settings |
| PATCH | `/settings/business` | Update name, bKash number, instructions |
| GET | `/theme/current` | Read-only theme (draft + published) |
| GET | `/domains` | List domains |
| POST | `/domains` | Add custom domain |
| POST | `/domains/verify` | Verify DNS (stub) |
| POST | `/domains/primary` | Set primary domain |
| GET | `/cms` | CMS blocks |
| PUT | `/cms/:key` | Upsert CMS block |

---

## `/api/storefront/:storeSlug` — Public storefront

No staff auth. Store resolved by slug.

### Catalog

| Method | Path | Description |
|--------|------|-------------|
| GET | `/home` | Store info + published theme + featured products |
| GET | `/products` | Product listing (`?page`, `?limit`, `?search`) |
| GET | `/products/:productSlug` | Product detail + variants |
| GET | `/categories` | Category tree |
| GET | `/categories/:categorySlug/products` | Category products |

### Checkout & payments

| Method | Path | Rate limit | Description |
|--------|------|------------|-------------|
| POST | `/checkout` | 30/min | Place order (COD or MANUAL_BKASH) |
| POST | `/payments/bkash` | — | Submit bKash txn after checkout |

#### Checkout body (abbreviated)

```json
{
  "items": [{ "productId": "...", "variantId": "...", "quantity": 1 }],
  "customerName": "Ayesha Rahman",
  "customerPhone": "01755555555",
  "deliveryAddress": {
    "line1": "12 Gulshan Avenue",
    "area": "Gulshan",
    "district": "Dhaka",
    "division": "Dhaka",
    "recipientName": "Ayesha Rahman",
    "recipientPhone": "01755555555"
  },
  "paymentMethod": "MANUAL_BKASH"
}
```

#### Submit bKash body

```json
{
  "orderId": "clxxxxxxxxxxxxxxxx",
  "bkashTxnId": "8N7A2BK901",
  "bkashSenderPhone": "01755555555",
  "bkashAmount": 2579
}
```

Moves order to `paymentStatus: PENDING_VERIFICATION`.

### Order tracking & customer auth

| Method | Path | Description |
|--------|------|-------------|
| POST | `/orders/lookup` | Lookup by `{ orderNumber, phone }` |
| POST | `/auth/otp/request` | Send OTP to phone (10/min) |
| POST | `/auth/otp/verify` | Verify OTP, return session token |

In development, OTP response includes `devCode` for testing.

---

## Example flows

### Manual bKash end-to-end

1. Customer: `POST /api/storefront/techworld-bd/checkout` with `paymentMethod: MANUAL_BKASH`
2. Customer: `POST /api/storefront/techworld-bd/payments/bkash` with txn details
3. Store staff: `GET /api/store/{storeId}/payments/pending-bkash`
4. Store staff: `POST /api/store/{storeId}/payments/bkash/approve`

### Master Admin theme publish

1. `PUT /api/admin/stores/{id}/theme/draft` — edit layout JSON
2. `POST /api/admin/stores/{id}/theme/publish`
3. Storefront `GET /home` serves published version

---

## Pagination

List endpoints return:

```json
{
  "items": [],
  "page": 1,
  "limit": 20,
  "total": 100
}
```

(Query param names may vary slightly per endpoint.)
