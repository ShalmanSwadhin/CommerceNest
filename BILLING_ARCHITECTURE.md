# CommerceNest — Pricing, Usage & Billing Architecture

This document explains the usage-limit and billing system: how a `Package` becomes a
store's actual resource limits, how the CommerceNest platform fee is calculated and
booked, and why the pieces are structured the way they are.

## 1. What already existed vs. what this adds

CommerceNest already had a `Package` model (Master Admin-editable pricing plans) with
`maxProducts`/`maxStaff`/`storageLimitMb`, a `subscription.service.ts` enforcing
product/staff limits at creation time, and `Store.planTier` as a loose string matching
a `Package.slug` by convention. That foundation is unchanged in shape — this work
extends it rather than replacing it:

- Added `Package.platformFeeRate`.
- Fixed `assertWithinProductLimit` to count only `ACTIVE` products (it previously
  counted every product regardless of status — see §2).
- Added storage-limit enforcement (previously `storageLimitMb` existed on `Package`
  but was never read anywhere).
- Added the entire billing ledger/period system (`BillingPeriod`,
  `BillingLedgerEntry`) — there was no billing/GMV/fee concept anywhere before this.

## 2. "Active product" — the exact definition

Only products with `status: ACTIVE` (published) count toward `maxProducts`. `DRAFT`
and `ARCHIVED` do not. This matches the definition `analytics.service.ts` already used
for its own product-count metric — `subscription.service.ts` previously diverged from
it (counting every product), which was a real bug: a merchant with 50 unpublished
drafts and zero live products would have been blocked from publishing their first one.
`getActiveProductCount(storeId)` in `subscription.service.ts` is the one place this is
computed; nothing else re-implements the query.

## 3. Staff count includes the store owner

The owner has always had `User.storeId` set and been included in
`prisma.user.count({ where: { storeId } })` — this was true before this task and is
preserved, not changed. A `maxStaff: 2` plan means "the owner plus one more," not "two
more besides the owner."

## 4. Storage — trusted, not client-asserted

`MediaAsset.bytes` is set once, at upload-registration time, from the real uploaded
file's size (capped at a 10MB sanity ceiling already enforced before this task).
Total usage is `SUM(bytes)` over a store's `MediaAsset` rows, computed live via a
single indexed aggregate query — not a cached counter, so deleting media frees the
allowance immediately with no separate reconciliation step and no orphaned-accounting
risk. `assertWithinStorageLimit(storeId, incomingBytes)` runs before
`media.service.ts#registerMediaAsset` persists a new asset; rejecting there (not
trusting a client-reported "my current usage is X") is what makes this authoritative.

## 5. The CommerceNest platform fee

### 5.1 What it is, and isn't

`Package.platformFeeRate` is a fraction (`0.005` = 0.50%) of eligible order value,
distinct from any payment-gateway processing fee (bKash's own charges, a future
online-gateway's charges). CommerceNest does not currently collect or model gateway
fees — only its own platform fee.

### 5.2 Eligible Order Value

```
eligibleOrderValue = max(0, order.subtotal − order.discountAmount)
```

Delivery charge is excluded — it's a pass-through logistics cost, not merchandise
revenue the platform has a stake in. Merchant-funded discounts reduce the fee base
(the merchant already collected less; charging the fee on the pre-discount amount
would over-charge them). There is no separate "platform-funded discount" concept in
this system, so no additional carve-out was needed. This function lives in
`billing.service.ts#eligibleOrderValue` — the one place this rule is expressed.

### 5.3 When the fee is booked

`isPaid` becomes `true` at exactly one point in the existing order lifecycle:
`transitionOrderStatus` setting `status: DELIVERED`. That's true for every payment
method — COD and MANUAL_BKASH alike (bKash orders require `paymentStatus: APPROVED`
*before* they can even reach `DELIVERED`, per the pre-existing `CONFIRMED` guard). So
DELIVERED is the single, universal "money is real" signal already built into the
order state machine, and `bookPlatformFeeForOrder` is called from inside that same
database transaction — not from an event handler, not after the fact. This is
deliberate: an order that's cancelled, fails payment, or is returned before delivery
(`SHIPPED → RETURNED` is a direct transition that skips `DELIVERED` entirely) never
reaches this code path, so it never generates a fee that would later need reversing.

### 5.4 Refunds — proportional reversal, not deletion

Ledger entries are never edited or deleted. When `return.service.ts#completeRefund`
processes a refund, `bookRefundAdjustment` looks up the order's original
`PLATFORM_FEE` entry (a no-op if none exists — e.g. the order was never delivered) and
books a negative `ADJUSTMENT` entry:

```
ratio = min(1, refundAmount / order.total)
adjustment = -(originalFeeAmount × ratio)
```

A full refund fully reverses the fee; a 30% refund reverses 30% of the fee. This runs
inside `completeRefund`'s own transaction, alongside the existing
`Order.paymentStatus → REFUNDED` update.

### 5.5 Idempotency

Every ledger entry carries `(storeId, referenceType, referenceId, type)` as a database
unique constraint — `Order`/order-id for `PLATFORM_FEE`, `ReturnRequest`/return-id for
the refund `ADJUSTMENT`, `BillingPeriod`/period-id for `SUBSCRIPTION_CHARGE`.
`createLedgerEntry` (private to `billing.service.ts`) attempts the insert and treats a
unique-constraint violation as "already booked" — a silent no-op, not an error. A
retried webhook, a duplicated admin action, or a re-run of the same code path can
never produce two fee entries for the same event.

## 6. Billing periods — snapshotted, not recalculated

`BillingPeriod` is a calendar-month window per store. `getOrCreateCurrentBillingPeriod`
is the one entry point every other billing function goes through; it:

1. Looks for an existing period covering "now."
2. If none exists, closes any prior `OPEN` period whose window has passed
   (`status → CLOSED`) and creates a new one, **copying** the store's current
   `Package` pricing into the period row (`planName`, `subscriptionPrice`,
   `platformFeeRate`, `currency`) rather than storing a reference to the `Package`.
3. Books that period's `SUBSCRIPTION_CHARGE` exactly once (guarded by the same
   idempotency mechanism).

This is intentionally lazy — rollover happens the next time anything touches billing
for that store (an order delivered, the usage page viewed), not on a cron. A scheduled
job could formalize "close periods at midnight on the 1st" later if promptness matters
more than simplicity; it isn't required for correctness today.

**Why snapshot instead of reading `Package` live:** if Master Admin changes Business's
platform fee from 0.40% to 0.35% next month, every *already-open* period for a
Business-tier store keeps calculating at 0.40% for the rest of its window — the change
only takes effect for periods opened *after* the edit. Historical/current invoices
never silently change because pricing changed elsewhere. Verified by a dedicated test
(`billing-usage.test.ts` → "an already-open period keeps its original rate").

## 7. Reading the ledger

- `getStoreUsage(storeId)` — products/staff/storage vs. limits. Computed live from
  three small indexed queries; no caching layer, because none of these queries scan
  more than one store's rows or touch historical data.
- `getStoreBillingSummary(storeId)` — the current period + its entries (Store Admin's
  "Plan & Usage" card).
- `listBillingPeriods(storeId)` / `getBillingPeriodDetail` — history (Master Admin's
  Store Detail page, Store Admin's own history if surfaced later).
- `listAllStoreBilling` — platform-wide rollup across every store (Master Admin
  Billing page), with an optional `storeId` filter.

None of these run on any storefront-facing (customer) request path — they're only
reachable from authenticated Store Admin / Master Admin routes, so they carry zero
performance risk for checkout, product browsing, or storefront loading.

## 8. Tenant isolation

Every usage/billing query is scoped by `storeId` — either as a direct `where` clause
(`getStoreUsage`, `getActiveProductCount`, etc.) or, for `BillingPeriod`/
`BillingLedgerEntry`, via the `storeId` column on those tables directly (not inferred
through a join). Verified by a dedicated cross-store test asserting store A's
platform fee entries never appear in store B's billing summary.

## 9. Deliberately not built (see the implementation report's "Remaining Decisions")

- Automated recurring subscription payment collection — there's no payment gateway in
  this codebase for *subscriptions* (bKash/COD are order-level checkout methods, not
  a mechanism for CommerceNest to charge merchants). The ledger models what's owed;
  actually charging it is a separate, unbuilt integration.
- Bandwidth/traffic and infrastructure-cost tracking — explicitly out of scope per the
  spec ("prepare the architecture," "do not fabricate cost data"); no code was added
  for either.
- A scheduler to close billing periods on a clock — lazy rollover is correct without
  one; see §6.
