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
- Hardening pass (this revision): closed a real activation-limit bypass via
  `updateProduct` (§2), closed a check-then-act concurrency race in product/staff
  limit enforcement with real Postgres row locking (§2.1, §3), moved all billing
  arithmetic from JS `number` to exact `Prisma.Decimal` (§5.5), and added a
  best-effort authoritative-size lookup for storage accounting (§4).

## 2. "Active product" — the exact definition

Only products with `status: ACTIVE` (published) count toward `maxProducts`. `DRAFT`
and `ARCHIVED` do not. This matches the definition `analytics.service.ts` already used
for its own product-count metric — `subscription.service.ts` previously diverged from
it (counting every product), which was a real bug: a merchant with 50 unpublished
drafts and zero live products would have been blocked from publishing their first one.
`getActiveProductCount(storeId)` in `subscription.service.ts` is the one place this is
computed; nothing else re-implements the query.

The limit applies at exactly one moment: a product **transitioning into** `ACTIVE`.
That covers both `createProduct` (when the new row's status is `ACTIVE`) and
`updateProduct` (when `existing.status !== ACTIVE && data.status === ACTIVE`). Editing
an already-active product's other fields, or moving a product *out* of `ACTIVE`, never
re-checks the limit — see `product.service.ts`'s `activating` flag. An earlier version
of this code only checked the limit in `createProduct`, which meant a merchant could
create unlimited `DRAFT` products (uncounted) and then `PATCH` each one to `ACTIVE`
with no check at all — a real bypass, closed by moving the check to cover every
activation path, not just creation.

### 2.1 Concurrency safety

A plain "count, then compare, then write" is a check-then-act race: two simultaneous
requests can both read `count = 49` against a limit of 50, both pass, and both write —
landing at 51. `subscription.service.ts#withStoreLock` closes this with a real Postgres
row lock: `SELECT id FROM stores WHERE id = $1 FOR UPDATE`, taken inside the same
transaction as the count-and-write. A second concurrent transaction trying to lock the
same store row simply blocks until the first commits or rolls back, then re-reads the
now-current count — so only one of any number of simultaneous requests can ever claim
the last slot. This serializes limit-sensitive writes **per store** (a different store
locks a different row, so unrelated stores are never blocked by each other).
`createProduct`, `updateProduct` (on activation), and `staff.service.ts#inviteStoreStaff`
all go through this lock. Proven by dedicated tests that fire genuine concurrent
requests via `Promise.allSettled` and assert the exact pass/fail split — not a
timing-based/flaky test, since the guarantee comes from the database lock itself, not
from luck about request ordering.

Serializable-transaction-with-retry was considered and rejected as more complex for no
additional correctness here — row locking is simpler, well-understood, and suffices at
this granularity (one store, one limit check, one write).

## 3. Staff count includes the store owner

The owner has always had `User.storeId` set and been included in
`prisma.user.count({ where: { storeId } })` — this was true before this task and is
preserved, not changed. A `maxStaff: 2` plan means "the owner plus one more," not "two
more besides the owner." Concurrent invites are protected by the same `withStoreLock`
mechanism as product activation (§2.1).

## 4. Storage — trusted, not client-asserted, and now concurrency-safe

`MediaAsset.bytes` is set once, at upload-registration time. Since uploads go directly
from the client to Cloudinary (a signed-upload flow — the API server never proxies the
file bytes), the server's first opportunity to record a size is when the client calls
back to register the asset, and that registration call is a request body the client
constructs — so a bare `bytes` field there is client-asserted, not server-observed.

### 4.1 Verification policy — fail closed, matching the SMS/email precedent

`media.service.ts#registerMediaAsset` resolves the byte count to trust through
`resolveStorageVerificationMode({ nodeEnv, cloudinaryConfigured })` — a **pure**
function with the exact same three-outcome shape as the pre-existing
`lib/sms.ts#resolveSmsMode`, deliberately reused rather than inventing a new
philosophy:

| Mode | When | Behavior |
|---|---|---|
| `real` | Cloudinary is configured | One Admin API lookup (`fetchVerifiedCloudinaryBytes`, HTTP Basic Auth) fetches the asset's real recorded size. If the lookup fails for any reason (network error, not yet propagated, malformed response), the registration is refused with `503 STORAGE_VERIFICATION_UNAVAILABLE` — the client is asked to retry, not silently trusted. |
| `unconfigured-production` | Not configured, `NODE_ENV=production` | Refused outright with the same `STORAGE_VERIFICATION_UNAVAILABLE` — production must never fall back to trusting an unverifiable client number. |
| `stub` | Not configured, dev/test | The client-supplied value is used (still bounded by the existing 10MB per-file ceiling). There is no real Cloudinary asset to check in this mode, so this isn't a security gap — it's the same dev-safe-stub convention SMS/email already use. |

Because `resolveStorageVerificationMode` takes explicit parameters instead of reading
`hasCloudinary`/`env.NODE_ENV` internally, all three branches are unit-tested directly
with no env mocking — see `product-staff-concurrency.test.ts`, matching exactly how
`resolveSmsMode` is tested.

### 4.2 Concurrency — verify first, lock second, never both at once

A first hardening pass fixed product/staff concurrency (§2.1) but left storage
check-then-act, because the storage check has an extra wrinkle the product/staff
checks don't: the trusted byte count can require a **network call** (the Cloudinary
lookup above), and holding a Postgres row lock across an external HTTP request would
turn one slow/stuck Cloudinary call into every other write against that store row
blocking behind it. The fix keeps the network call and the lock strictly separate:

```
registerMediaAsset(storeId, input)
  1. resolveVerifiedBytes(input)   — Cloudinary call (or stub), NO transaction open
  2. withStoreLock(storeId, tx =>  — short DB-only transaction starts here
       assertWithinStorageLimitTx(tx, storeId, bytes)  — re-reads usage under the lock
       tx.mediaAsset.create(...)                        — same transaction
     )                              — commit, lock released
```

Step 2's *re-check* (not step 1's already-resolved number) is what makes concurrent
uploads safe: two simultaneous registrations for the same store serialize on the row
lock exactly as product/staff writes do (§2.1), so the second one always sees the
first's already-committed usage before deciding whether it still fits. The Cloudinary
verification itself is *not* re-done under the lock — only the usage-vs-limit
comparison is, which is the part that actually needs to be atomic.

Total usage is `SUM(bytes)` over a store's `MediaAsset` rows, computed live via a
single indexed aggregate query — not a cached counter, so deleting media frees the
allowance immediately with no separate reconciliation step and no orphaned-accounting
risk. Duplicate registration of the same `publicId` for a store is rejected outright by
a database unique constraint (`@@unique([storeId, publicId])`), not silently
double-counted.

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

**`eligibleGmv` is gross, not net-of-refund.** `BillingPeriod.eligibleGmv` is a running
sum of every delivered order's eligible value for that period, and a later refund does
**not** subtract from it — only `platformFeeAmount` is adjusted down (§5.4). This is
deliberate: "gross merchandise value" conventionally means what was sold, not what was
sold minus later returns. If a net-of-refund figure is ever needed for reporting, it
should be a distinct derived metric (e.g. `eligibleGmv` − sum of refund adjustments'
underlying order values) rather than a change to what `eligibleGmv` itself means.

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

### 5.5 Exact decimal arithmetic

Every step of this calculation — `eligibleOrderValue`, the fee multiplication, the
refund ratio, the adjustment amount — is done using `Prisma.Decimal` (the decimal.js
class Prisma itself uses for `Decimal` columns; already a project dependency, so no
new package was added). Values are never converted to a plain JS `number` and back
during a calculation — only at the very end, for read-only API/JSON display of an
already-final, already-rounded amount, which carries no precision risk.

This matters concretely: naive `number` arithmetic (`Math.round(eligible * rate * 100)
/ 100`) silently mis-rounds real cases at all three plan rates — e.g. `29 × 0.005`
(Starter) evaluates to a float fractionally below `0.145`, rounding down to `0.14`
instead of the mathematically correct `0.15`. `36.25 × 0.004` (Business) and
`58 × 0.0025` (Pro) have the same problem at their own rates. `billing-usage.test.ts`
→ "Exact decimal money arithmetic" tests these exact inputs (and a repeating-decimal
refund ratio, and large-magnitude amounts) against their verified-correct results.

**Rounding rule:** round-half-up to 2 decimal places (paisa) — e.g. `10.005 → 10.01` —
applied exactly once, at the point each ledger-entry amount is computed
(`roundMoney()` in `billing.service.ts`). Nothing downstream re-rounds an
already-rounded value. This matches the `Decimal(12,2)` precision every money column
already uses, and is the conventional rule for currency amounts with 2 fractional
digits (BDT, the only currency this platform handles today).

### 5.6 Idempotency

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

**Closed periods can still receive adjustments — this is correct, not a bug.**
Individual `BillingLedgerEntry` rows are genuinely immutable: nothing ever updates or
deletes one, only creates new ones. But a `BillingPeriod`'s *aggregate*
`platformFeeAmount` can still change after that period's `status` becomes `CLOSED`,
because a refund processed after the period closes (e.g. an order delivered in
August, refunded in September) correctly adjusts *August's* total, not September's —
`bookRefundAdjustment` writes to `originalFee.billingPeriodId`, not to "whichever
period is currently open." This is the accounting-correct behavior: the adjustment
belongs to the period the original fee was earned in. So the precise claim is: the
ledger is append-only and every individual entry is immutable, but a closed period's
summary figures are not frozen in the sense of "can never move again" — they can, via
a new, dated, attributable adjustment entry, which is itself immutable and traceable
back to the return that caused it.

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
  actually charging it is a separate, unbuilt integration. §10 below adds the manual
  invoice/payment-verification workflow that fills this gap for V1.
- Bandwidth/traffic and infrastructure-cost tracking — explicitly out of scope per the
  spec ("prepare the architecture," "do not fabricate cost data"); no code was added
  for either.
- A scheduler to close billing periods on a clock — lazy rollover is correct without
  one; see §6.

## 10. Phase 3 — Invoice & Merchant Payment System

Builds `Invoice` and `MerchantPayment` on top of everything in §1–9 without touching
the shape of `Package`, `BillingPeriod`, or `BillingLedgerEntry`. Full design rationale
lives in `MERCHANT_PAYMENT_ARCHITECTURE_PROPOSAL.md` (the pre-approved proposal this
section documents the as-built version of).

### 10.1 Three separate concepts, never collapsed into one balance

- **What the merchant owes** — `BillingPeriod` (unchanged) + the new `Invoice`, a
  snapshot taken when a period closes.
- **What the merchant has paid** — `MerchantPayment`, a manual bKash/bank-transfer
  claim that only becomes real money once Master Admin verifies it.
- **What CommerceNest owes back** — merchant credit, represented as signed
  `BillingLedgerEntry` rows of the existing `CREDIT` type (see §10.5). No new model.

### 10.2 Invoice — generation, numbering, immutability

`invoice.service.ts#ensureInvoicesForClosedPeriods(storeId)` is the lazy trigger
(mirroring `getOrCreateCurrentBillingPeriod`'s own lazy-rollover): it closes any stale
open period, then generates an `Invoice` for every `CLOSED` period that doesn't have
one yet. Called from the top of every store/admin invoice-read endpoint — no cron job.

- **Idempotent at the database level**: `Invoice.billingPeriodId` is `@unique`.
  `generateInvoiceForPeriod` catches the resulting P2002 and treats it as "someone
  else already generated this" rather than an error. Verified under literal concurrent
  generation (5 simultaneous calls → exactly 1 invoice).
- **Invoice number**: `CN-{year}-{month}-{seq}`, `seq` from a real Postgres
  `SEQUENCE` (`invoice_number_seq`), not a read-modify-write counter — `nextval()` is
  atomic with zero locking needed. Unique, human-readable, immutable once issued.
- **Snapshot**: `subscriptionAmount`/`platformFeeAmount` are copied from the period at
  generation time and never change again — a later `Package` price change cannot alter
  an already-issued invoice. `adjustmentAmount` is the *only* field that moves after
  issuance (via §10.6), and `totalAmount` is always kept equal to the sum of the three.
- **Due date**: `issueDate + paymentTermDays`, where `paymentTermDays` is read from
  `PlatformSettings` key `billing.invoicePaymentTermDays` (default 7) via
  `getInvoicePaymentTermDays()`/`setInvoicePaymentTermDays()` — same
  upsert-with-fallback shape as `trial.service.ts`'s trial-duration setting, writable
  through the already-existing generic `PUT /admin/settings/:key` route (no new admin
  route needed). Changing the setting never touches an already-issued invoice's
  `dueDate`, since it's stored, not recomputed.
- **Status**: `DRAFT → ISSUED → PARTIALLY_PAID/PAID/OVERDUE`, always derived from
  `amountPaid + creditApplied` vs. `totalAmount` by `recomputeInvoiceStatus` — never
  set directly by any route. `OVERDUE` is applied lazily (`syncOverdueStatus`, checked
  on read) when `dueDate` has passed and the invoice isn't fully settled. No
  suspension/restriction policy exists yet — `OVERDUE` is a terminal display state for
  V1, per explicit instruction not to invent day-count escalation policies.

### 10.3 MerchantPayment — manual bKash / bank transfer only

A dedicated model, entirely separate from `Order`'s customer-checkout payment fields
(`Order.bkashTxnId` etc. are never read or written by this system). `method` is
`MANUAL_BKASH | MANUAL_BANK_TRANSFER`; `status` is
`PENDING_VERIFICATION → APPROVED | REJECTED | CANCELLED`.

- Merchant submits a claim (`submitPaymentClaim`) against one of their own invoices —
  scoped by `storeId` in the same query, so a claim can never be created against
  another store's invoice. Creates the row `PENDING_VERIFICATION`; nothing about the
  invoice changes yet.
- **Duplicate transaction/reference protection is a database constraint**, not an
  application check: a partial unique index on `(method, referenceId)` WHERE `status
  IN ('PENDING_VERIFICATION', 'APPROVED')` (hand-added to the migration — Prisma's
  schema DSL can't express a partial index). Global across stores, since a real bKash
  transaction reference can't legitimately back two live claims regardless of who
  submitted them. Scoped to non-terminal statuses so a corrected resubmission after a
  `REJECTED`/`CANCELLED` claim is never permanently blocked.
- Master Admin verification (`approvePayment`/`rejectPayment`) re-reads the payment's
  status *inside* a `withStoreLock` (the same store-row `FOR UPDATE` primitive used
  for product/staff/storage-limit races) before doing anything — this is what makes
  double-click, repeated approval requests, and genuinely concurrent approval attempts
  all collapse to exactly one winner. Verified with literal `Promise.allSettled` of
  two concurrent approvals.
- A rejected claim is never deleted (it's the audit record) and never touches the
  ledger or the invoice balance. Rejection always requires a reason, recorded with
  `verifiedById`/`verifiedAt`/`rejectionReason`.
- Routes live under `/merchant-payments` (store and admin routers alike), deliberately
  not `/payments` — this codebase already has customer-order bKash verification at
  `/payments/*`; Express matches routes in registration order, so reusing that prefix
  would have silently shadowed the older routes. Distinct prefixes also make the
  "these are two separate systems" requirement visible at the URL level.

### 10.4 Payment application — exact, capped, excess becomes credit

`invoice.service.ts#applyVerifiedPaymentToInvoice`, called only from inside
`approvePayment`'s lock, after the ledger `PAYMENT` entry is successfully booked:

1. `amountDue = max(totalAmount − amountPaid − creditApplied, 0)`.
2. `applied = min(paymentAmount, amountDue)` is added to `amountPaid`.
3. Any `paymentAmount − applied` excess is issued as credit (§10.5), keyed by the
   `MerchantPayment`'s own id — so it can never double-issue even if this function
   somehow ran twice for the same payment.
4. Status is recomputed (§10.2).

A rejected payment never reaches this function at all — the ledger and invoice are
untouched by construction (not by a status check that could be bypassed).

### 10.5 Merchant credit — signed ledger entries, not a new model

Reuses the existing `BillingLedgerEntry.type = CREDIT` value, now meaningful in both
directions: **positive** amount = credit issued (`issueCredit`), **negative** = credit
consumed (`consumeCredit`). A store's available balance is `SUM(amount) WHERE
storeId = X AND type = CREDIT` — a live aggregate, not a cached/mutable field, so the
balance is always derivable from the same append-only, idempotent, tenant-scoped rows
every other ledger entry already gets for free. `getAvailableCredit`/`issueCredit`/
`consumeCredit` live in `billing.service.ts`, entirely unaware of `Invoice` —
`invoice.service.ts` depends on them, never the reverse (see §10.7).

Credit is applied automatically the moment a new invoice is generated
(`applyAvailableCreditToInvoice`), capped at that invoice's `amountDue` so it can never
itself create an overpayment, and keyed by `(referenceType: 'Invoice', referenceId:
invoice.id)` — at most one "credit applied" event can ever exist per invoice.

### 10.6 Late refund adjustments — CASE A / B / C

When a refund is completed on an order whose platform fee had already been booked
(`return.service.ts#completeRefund` → `billing.service.ts#bookRefundAdjustment`, now
returning `{ billingPeriodId, adjustmentAmount } | null` instead of `void`, so it can
report back to the invoice layer without `billing.service.ts` importing `Invoice` at
all), `invoice.service.ts#applyLateRefundAdjustment` reacts based on that period's
invoice, if one exists:

- **No invoice yet** — nothing to do; the eventual invoice already reflects the
  now-reduced period total.
- **CASE A/B (unpaid or partially paid)** — the reduction is applied as an *atomic
  relative decrement* to `adjustmentAmount`/`totalAmount` (`{ decrement: … }`, never a
  read-then-write of an absolute value), so two refunds landing on the same invoice
  concurrently can't clobber one another. If the reduced total ends up below what's
  already been paid/credited, the excess becomes credit — keyed by the refund's own
  `ReturnRequest` id, so it can never double-issue even under a retried call.
- **CASE C (already fully PAID)** — the invoice is never rewritten. Credit is issued
  instead, for the full adjustment amount, same idempotency key.
- **VOID** — never adjusted.

The ledger itself never changes shape here: `bookRefundAdjustment` still writes one
`ADJUSTMENT` entry, append-only, exactly as before this phase.

### 10.7 Dependency direction (avoiding a circular import)

`billing.service.ts` stays entirely unaware `Invoice` exists. It exposes generic
primitives (`toDecimal`, `roundMoney`, `issueCredit`, `consumeCredit`,
`getAvailableCredit`, `bookMerchantPaymentReceived`, and `bookRefundAdjustment`'s new
return value) that `invoice.service.ts` and `merchant-payment.service.ts` import and
build on. Nothing in `billing.service.ts` imports from either of those two files. This
is what let Phase 3 be added without touching `BillingPeriod`/`BillingLedgerEntry`'s
existing behavior at all.

### 10.8 Tenant isolation & security

Every invoice/payment read and write is scoped by `storeId` in the query itself
(`findFirst({ id, storeId })`, never a separate ownership check after an unscoped
fetch) — a store can't read, submit a claim against, or benefit from another store's
invoice, payment, or credit. All financial fields are server-computed; no route lets a
merchant set an invoice's amounts or status directly. Verification (`approve`/`reject`)
lives exclusively under `adminRouter`, which already requires `MASTER_ADMIN` — a
merchant token gets a 403 before the handler ever runs, verified with a live HTTP
check against `requireMasterAdmin`, not just a unit assumption.

### 10.9 Deliberately not built (V1)

- Automated bKash/gateway API integration — V1 is manual claim + Master Admin
  verification only, by explicit instruction. The data model (separate
  `MerchantPayment.method`/`referenceId`, append-only ledger, idempotent
  verification) is additive-friendly for a future automated method without a rebuild.
- Automatic suspension/restriction on overdue invoices — `OVERDUE` is a terminal
  display state for now; no day-count escalation policy exists.
- PDF invoice generation — a web-based statement (the existing serialized `Invoice` +
  `MerchantPayment` JSON, rendered by Store Admin/Master Admin UI) is sufficient for
  V1, per explicit instruction not to build this unless already trivial.

## 11. Phase 4 — QA audit findings and fixes

A full audit of the merchant/Master Admin billing *experience* (not new architecture)
against the code as it actually runs, not just the docs above. Two real, pre-existing
bugs were found and fixed; the rest of this phase was UX/transparency work on top of
the already-correct backend from §1–10.

### 11.1 CRITICAL — trial stores were being billed real money

`getOrCreateCurrentBillingPeriod` (§6/§10.2) read `Store.planTier` to snapshot a
period's `subscriptionPrice`/`platformFeeRate`, but never checked `Store.isTrial`. A
brand-new trial store defaults to `planTier: 'starter'` (a real, non-zero paid plan —
`monthlyPrice: 499` in the seed data) — so from day one of a *free* 7-day trial, the
store was accruing a real `SUBSCRIPTION_CHARGE` ledger entry and real `PLATFORM_FEE`
entries on any delivered order, and would eventually get a real `Invoice` demanding
payment for a trial that was supposed to be free.

**Fix**: `getOrCreateCurrentBillingPeriod` now also selects `isTrial`; while
`isTrial === true`, the period opens with `subscriptionPrice: 0` and
`platformFeeRate: 0` instead of the plan's real values. `planSlug`/`planName` still
reflect the plan being trialed (informative). This required no changes to
`bookPlatformFeeForOrder` — its existing `feeAmount.lte(0)` idempotent-skip guard
already does the right thing once the rate is 0. Converting to paid
(`trialService.convertTrial` flips `isTrial` to `false`) never retroactively charges
the already-open trial-priced period — consistent with how a `Package` price change
never retroactively affects an already-open period either; real billing starts from
the *next* period. Product/staff/storage limit enforcement was already fully
independent of `BillingPeriod` (it reads `Package` directly by `planTier`), so this
fix has zero effect on limit enforcement during trial.

### 11.2 HIGH — Master Admin's platform-wide billing views could silently understate reality

Invoice generation is intentionally lazy (§10.2) — triggered by *reading* a specific
store's billing. `listAllInvoices`/`getPlatformBillingSummary` (Master Admin's
cross-store views) never triggered generation for any store, only for a store someone
had individually opened. A store whose merchant never opened their own billing page,
and whose Master Admin never opened that specific store's detail page, would have
closed periods that never generate an invoice — so platform-wide totals (total
invoiced/collected/outstanding, pending claims, overdue count) would silently omit it.

**Fix**: added `ensureInvoicesForAllClosedPeriods()` — the same idea as
`ensureInvoicesForClosedPeriods`, widened from one store to every store with a closed,
uninvoiced period — called at the top of both platform-wide read functions. Still
fully lazy (triggered by Master Admin viewing platform billing, not a scheduled job);
no background-job infrastructure was added.

### 11.3 HIGH — no way to configure merchant payment instructions

`billing.paymentInstructions` (bKash number, bank details) was readable via
`invoice.service.ts#getPaymentInstructions()` and the store-facing route, but nothing
in Master Admin's UI could *set* it — only a raw API call could. In a real deployment
this meant the manual-payment flow was permanently non-functional (merchants would
always see "not configured yet"). Fixed by extending the existing generic Settings
page (`admin-panel/src/pages/SettingsPage.tsx`) with a "Merchant billing" card that
writes `billing.paymentInstructions` and `billing.invoicePaymentTermDays` through the
already-existing generic `PATCH /admin/settings` route — no new backend route needed.

### 11.4 HIGH — platform fee transparency was missing from the merchant-facing invoice

The invoice breakdown showed a platform-fee *amount* with no rate or explanation, so a
merchant had no way to understand why their fee was what it was without doing their
own math. `platformFeeRate`/`eligibleGmv` (already stored on the linked
`BillingPeriod`, frozen the same way the invoice's own amounts are frozen at issuance)
are now joined into the invoice serialization (`getCurrentInvoiceForStore`,
`listInvoicesForStore`, `getInvoiceDetail`) and displayed as "Platform fee (0.40%):
delivered orders' subtotal minus discount, excluding delivery" on the Store Admin
Billing page — read-only, server-calculated, no frontend math.

### 11.5 MEDIUM — UX polish

- Internal enum status names (`PENDING_VERIFICATION`, `ISSUED`) are now mapped to
  merchant-facing language ("Payment submitted — waiting for verification", "Awaiting
  payment") on both Store Admin and Master Admin billing pages, instead of a raw
  underscore-to-space replace.
- A rejected payment's reason is now surfaced proactively on the "Current invoice"
  card itself (previously only visible by opening invoice history → view details), with
  a "Submit corrected payment" call to action.
- An `OVERDUE` invoice now shows an explicit warning banner (amount due, due date)
  instead of relying on the status badge color alone.
- Master Admin's Store Detail page now shows that store's merchant payment history
  (submitted/approved/rejected claims), not just its invoices — reusing the existing
  `listPaymentsForStore` service function through a new admin-scoped route.
- Master Admin gets an in-app notification (existing `notifyMasterAdmins` /
  `Notification` model — no new infrastructure) when a merchant submits a payment
  claim, so the pending queue doesn't rely on manual refreshing to be noticed.
- `PlanUsageCard` (Settings page) now links to the full Billing page for discoverability.

### 11.6 Confirmed correct, left unchanged

- Invoice/payment/credit financial-integrity guarantees from §10 (idempotent
  generation, atomic payment application, CASE A/B/C refund handling, tenant
  isolation, RBAC) — re-verified, no bugs found.
- Downgrade-over-limit messaging on `PlanUsageCard`'s usage bars ("You've reached this
  limit... Contact CommerceNest to discuss upgrading") already explains the situation
  without deleting any data — already correct, not touched.
- Lazy invoice generation itself — no real business/UX problem was found with the
  *lazy* part specifically (only the "which stores get covered" gap in §11.2); no
  scheduled-job infrastructure was introduced.
- Trial-to-paid conversion (`convertTrial`) already never touches products, themes,
  customers, or orders — only `Store` fields — so no data-loss risk existed there.
