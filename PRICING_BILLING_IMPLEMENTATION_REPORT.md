# Pricing, Usage, Billing & Infrastructure Monetization — Implementation Report

## Executive Summary

CommerceNest already had a solid foundation for this: a Master Admin-editable
`Package` model, a `subscription.service.ts` enforcing product/staff limits, and a
loose `Store.planTier → Package.slug` convention. This work extended that foundation
— it did not replace it. Added: a platform-fee field on `Package`; storage-limit
enforcement (previously defined but never read); a fix for a real pre-existing bug
(the product limit counted every product, not just active ones); and an entirely new
billing ledger/period system (there was none before) that snapshots pricing per
period, books the platform fee exactly once per delivered order, and reverses it
proportionally on refund. All enforcement is server-side and authoritative — nothing
here can be bypassed by a direct API call or a client-supplied number. 119/119 tests
pass (101 pre-existing + 18 new), all 7 workspaces build clean, and every new UI
surface was verified live in a browser.

## Phase 1 — Storage Integrity Hardening

Closes the one limitation the previous hardening pass explicitly left open: storage
was capacity-checked but not concurrency-safe, the same class of check-then-act race
already fixed for products and staff.

### Storage concurrency solution

Two simultaneous uploads near the limit (e.g. 1,950/2,000 MB used, two 40 MB uploads
arriving at once) could previously both pass the same stale usage check and both
succeed, exceeding the limit. Fixed with the same `withStoreLock` row-lock mechanism
already used for products/staff (`subscription.service.ts#assertWithinStorageLimitTx`),
but with a deliberate ordering constraint: the (potentially slow) Cloudinary
verification network call happens **before** any transaction opens, and only the
usage-vs-limit re-check + `MediaAsset` insert happen inside the short, DB-only locked
transaction. This avoids holding a Postgres row lock across an external HTTP request,
which would otherwise let one slow Cloudinary call block every other write against
that store. See `BILLING_ARCHITECTURE.md` §4.2 for the full flow diagram.

### Cloudinary verification behavior

Decided policy: **fail closed**, mirroring the pre-existing `lib/sms.ts#resolveSmsMode`
pattern exactly (same three modes, same reasoning) rather than inventing a new one.

- Cloudinary configured → the real recorded size is used; if the lookup itself fails
  (network error, malformed response, not yet propagated), registration is refused
  with `503 STORAGE_VERIFICATION_UNAVAILABLE` and the client is asked to retry — never
  silently falls back to the client's number.
- Cloudinary unconfigured **in production** → same refusal. Production must never
  trust an unverifiable client-supplied byte count.
- Cloudinary unconfigured **outside production** (dev/test) → the client-supplied
  value is used (still bounded by the existing 10MB per-file ceiling). There's no real
  Cloudinary asset to check against in this mode, so this isn't a gap — it's the same
  dev-safe-stub convention already established for SMS and email in this codebase.

`resolveStorageVerificationMode` is a pure function taking explicit
`{nodeEnv, cloudinaryConfigured}` rather than reading env internally, so all three
branches are directly unit-tested with no mocking — matching how `resolveSmsMode`
is already tested.

### Files Changed (Phase 1)

| File | Change |
|---|---|
| `packages/types/src/api.ts` | Added `STORAGE_VERIFICATION_UNAVAILABLE` error code |
| `apps/api/src/services/subscription.service.ts` | Added `assertWithinStorageLimitTx` (transaction-aware); `getStorageUsedBytes` now accepts an optional transaction client |
| `apps/api/src/services/media.service.ts` | `registerMediaAsset` rewritten: verify bytes (Cloudinary lookup or dev stub) outside any transaction, then a short `withStoreLock` transaction re-checks usage and creates the asset; added pure `resolveStorageVerificationMode` |
| `apps/api/src/product-staff-concurrency.test.ts` | Added storage boundary/concurrency/verification-mode tests |
| `BILLING_ARCHITECTURE.md` | Rewrote §4 to document the verify-then-lock flow and fail-closed policy |

### Tests

| | |
|---|---|
| Previous passing | 135 |
| New tests added | 10 |
| **Final passing** | **145** |
| Failed | **0** |

New tests: 3 pure `resolveStorageVerificationMode` branch tests (real / unconfigured-
production / stub), and 7 integration tests — normal upload, exact-boundary upload
(succeeds, limit is inclusive), over-limit rejection, a genuine concurrent-upload race
proven via `Promise.allSettled` (5 simultaneous uploads where only 1 fits, asserting
final usage never exceeds the limit), delete-frees-space, duplicate-registration
rejection, and cross-store isolation.

### Build result

All 7 workspaces (`types`, `prisma`, `api`, `admin-panel`, `store-dashboard`,
`storefront`, `marketing`) build clean via `npm run build`.

### Remaining risks

- The Cloudinary Admin API lookup adds one external network round-trip to the upload
  registration request's latency (not to any read path). If Cloudinary is slow, so is
  registration — no timeout/circuit-breaker was added beyond the existing `fetch`
  default behavior, matching how `lib/sms.ts`'s Twilio call is already handled.
- `MAX_MEDIA_BYTES` (10MB per file) is unchanged and still enforced by the zod schema
  before any of this logic runs.

## Hardening Pass (Product/Staff Limits, Money Arithmetic, Storage Trust)

A follow-up audit (prompted by a direct Q&A review of the original implementation)
found two genuine bugs and two technical weaknesses in the system above. This section
documents that hardening pass; sections A–H below describe the original
implementation and are otherwise unchanged.

### Fixed

1. **Product active-limit bypass.** `createProduct` checked the limit; `updateProduct`
   did not. A merchant could create unlimited `DRAFT` products (uncounted) and then
   `PATCH` each one's status to `ACTIVE`, never triggering a check. Audited every
   product-mutation path (`createProduct`, `updateProduct`, `archiveProduct`,
   `adjustVariantStock`) — no bulk-activation, import, or duplication endpoints exist
   in this codebase, so those two were the only paths. Fixed by centralizing the rule
   as "the limit applies whenever a product transitions **into** `ACTIVE`," checked in
   both `createProduct` (when the new row is `ACTIVE`) and `updateProduct` (when
   `existing.status !== ACTIVE && data.status === ACTIVE`) — never on edits to an
   already-active product or transitions out of `ACTIVE`.
2. **Check-then-act concurrency race**, in both product-limit and staff-limit
   enforcement. Two simultaneous requests could both read a count under the limit and
   both write, exceeding it. Fixed with a real Postgres row lock:
   `subscription.service.ts#withStoreLock` takes `SELECT id FROM stores WHERE id = $1
   FOR UPDATE` inside a transaction before the count-and-write, so concurrent
   operations against the same store are serialized (different stores are never
   blocked by each other). Applied to `createProduct`, `updateProduct` (on
   activation), and `staff.service.ts#inviteStoreStaff`.
3. **Exact decimal billing arithmetic.** All money calculations (eligible order value,
   platform fee, refund ratio, refund adjustment) now use `Prisma.Decimal` — the
   decimal.js class already bundled with Prisma, so no new dependency — instead of
   converting to plain JS `number` for the arithmetic. Verified against real cases
   where naive float rounding gives the wrong answer at each of the three plan rates
   (e.g. `29 × 0.005` naively rounds to `0.14`; the correct value is `0.15`). Rounding
   rule: round-half-up to 2 decimal places, applied once, at the point each ledger
   entry's amount is computed. See `BILLING_ARCHITECTURE.md` §5.5.
4. **Storage byte trust.** `MediaAsset.bytes` was entirely client-supplied at
   registration time. `media.service.ts` now attempts one Cloudinary Admin API lookup
   per registration (not per read) for the asset's authoritative size and uses that in
   preference to the client value, falling back gracefully (not blocking the upload)
   if Cloudinary is unconfigured or the lookup fails.

### Tests

| | Count |
|---|---|
| Previous passing | 119 |
| New tests added | 16 |
| Final passing | **135** |
| Failed | **0** |

New file `product-staff-concurrency.test.ts` (9 tests) — fires genuine concurrent
requests via `Promise.allSettled` against real Postgres locks (not timing-dependent):
product-limit races at limit-1/exactly-at-limit/mixed-with-DRAFT scenarios, concurrent
DRAFT→ACTIVE activation racing for the last slot, concurrent edits to an
already-active product never falsely rejected, staff-limit races, and duplicate
media-registration rejection.

New tests in `billing-usage.test.ts` (7 tests, "Exact decimal money arithmetic") —
the three real float-rounding-mismatch cases (one per plan rate), a repeating-decimal
(1/3) refund ratio, sequential adjustments across multiple orders staying exact,
sub-paisa amounts correctly rounding to a no-op, and a large-magnitude amount
staying exact.

All 8 pre-existing test files continue to pass unchanged. Full monorepo build
(`npm run build`, all 7 workspaces) is clean. Live-verified in the browser: normal
(non-concurrent) product create/edit, staff invite, and the Plan & Usage card all
still render and function correctly after the transaction/locking changes.

### Files Changed

| File | Change |
|---|---|
| `apps/api/src/services/subscription.service.ts` | Added `withStoreLock`, `assertWithinProductLimitTx`, `assertWithinStaffLimitTx`; `limitsFor`/`getActiveProductCount`/`getStaffCount` now accept an optional transaction client |
| `apps/api/src/services/product.service.ts` | `createProduct` and `updateProduct` now run their limit-check-and-write inside `withStoreLock`; `updateProduct` gained the missing activation check |
| `apps/api/src/services/staff.service.ts` | `inviteStoreStaff` now runs inside `withStoreLock` |
| `apps/api/src/services/billing.service.ts` | Rewritten to use `Prisma.Decimal` throughout for all money arithmetic; added `roundMoney`/`toDecimal` helpers |
| `apps/api/src/services/media.service.ts` | Added `verifyCloudinaryAssetBytes`; `registerMediaAsset` prefers its result over the client-supplied `bytes` |
| `apps/api/src/product-staff-concurrency.test.ts` | New — concurrency + duplicate-registration tests |
| `apps/api/src/billing-usage.test.ts` | Added "Exact decimal money arithmetic" test block |
| `BILLING_ARCHITECTURE.md` | Documented concurrency locking, exact-decimal arithmetic and its rounding rule, closed-period-adjustment nuance, storage-verification flow |

### Remaining Known Limitations

- **Storage-limit enforcement is not lock-protected.** The same class of race fixed
  for products/staff (§2 above) is structurally still possible for storage uploads —
  two concurrent uploads could both pass a check-then-act storage check. Not fixed in
  this pass: storage is a capacity cap, not a billed quantity, so the stakes are lower,
  and it wasn't requested. Would use the same `withStoreLock` pattern if hardened later.
- **Cloudinary byte verification is best-effort, not a hard guarantee.** If the lookup
  fails (network error, propagation delay, misconfiguration) the system falls back to
  the client-supplied value, still bounded by the existing 10MB sanity ceiling but not
  independently verified in that fallback case.
- Everything listed in the original report's "Remaining Decisions" (§H below) is
  unchanged by this pass: there is still no real payment-collection mechanism, no
  formal invoice document, and no "mark as paid" admin action.

## A. Existing Architecture Found

- **`Package` model** (`packages/prisma/schema.prisma`): name, slug, monthlyPrice,
  yearlyPrice, currency, active, featured, displayOrder, maxProducts, maxStaff,
  maxOrders (unused), storageLimitMb, features[], trialDays, customThemeAvailability,
  supportLevel. Full CRUD already existed: `package.service.ts`,
  `/admin/packages` routes, and a complete admin UI (`PricingPage.tsx`) — including
  the exact safety rule the spec asked for ("archive instead of delete when a plan is
  in use").
- **`Store.planTier`**: a plain string, deliberately not a hard foreign key to
  `Package` — documented in the schema as intentional, so a store never breaks if its
  package is renamed/removed.
- **`subscription.service.ts`**: `assertWithinProductLimit`/`assertWithinStaffLimit`,
  already wired into `product.service.ts#createProduct` and
  `staff.service.ts#inviteStoreStaff`. Bug found: product limit counted **every**
  product regardless of status, not just `ACTIVE` ones (fixed — see §D).
- **`MediaAsset`**: already tracked `bytes` per file, set from the real uploaded
  file's size at registration time. No limit was ever enforced against it.
- **Order model**: `subtotal`, `discountAmount`, `deliveryCharge`, `total`,
  `paymentMethod`, `paymentStatus`, `isPaid`. `isPaid` flips to `true` at exactly one
  point — the `DELIVERED` transition — for every payment method. This became the
  platform-fee trigger (see §F).
- **`ReturnRequest` + `return.service.ts#completeRefund`**: already recorded
  `refundAmount`/`refundMethod` and flipped `Order.paymentStatus → REFUNDED`. Became
  the refund-adjustment hook.
- **`AuditLog`**: generic actor/action/target/metadata table, reused directly for
  billing-relevant admin actions (package price/fee changes already logged via
  `package.service.ts`'s existing `PACKAGE_UPDATED` audit entries).
- **Trial conversion** (`trial.service.ts#convertTrial`): already correctly preserves
  all store data on plan change — updates `planTier` in place on the same `Store` row,
  never recreates it. No change needed; confirmed by a new test that a downgrade never
  deletes existing products.
- **Missing entirely**: any concept of GMV, platform fee, billing period, or ledger.
  Confirmed via full-codebase search before writing any code.

## B. Changes Made

1. Added `Package.platformFeeRate` (fraction, e.g. 0.005 = 0.50%).
2. Fixed `assertWithinProductLimit` to count only `status: ACTIVE` products (was: all
   products) — matches the definition `analytics.service.ts` already used elsewhere.
3. Added `assertWithinStorageLimit`, wired into `media.service.ts#registerMediaAsset`.
4. Added `getStoreUsage`, `getActiveProductCount`, `getStorageUsedBytes`,
   `getStaffCount` as the single reusable source for usage numbers everywhere.
5. Built `billing.service.ts`: billing-period lifecycle, platform-fee booking, refund
   adjustment, idempotent ledger writes, read views for Store Admin/Master Admin.
6. Hooked fee booking into `order.service.ts#transitionOrderStatus` (at `DELIVERED`,
   inside the same transaction) and refund adjustment into
   `return.service.ts#completeRefund` (inside its transaction).
7. Extracted a shared `isUniqueConstraintError` helper into `lib/prisma.ts`
   (previously duplicated in two service files; now three use the one copy).
8. New API routes: `/admin/stores/:id/usage`, `/admin/stores/:id/billing[/:periodId]`,
   `/admin/billing`, `/store/usage`, `/store/billing[/periods]`.
9. New error codes: `PRODUCT_LIMIT_REACHED`, `STAFF_LIMIT_REACHED`,
   `STORAGE_LIMIT_REACHED` (previously one generic `PLAN_LIMIT_EXCEEDED`).
10. Frontend: admin `PricingPage.tsx` gained a platform-fee field; new `Usage`/
    `Billing` cards on admin `StoreDetailPage.tsx`; the old "Licenses" placeholder page
    (which literally said "planned for a later release" — exactly what this task
    built) became a real platform-wide `BillingPage.tsx`; store-dashboard gained a
    `PlanUsageCard.tsx` on Settings; marketing's pricing pages now show product/staff
    limits and the platform fee rate per plan, with explicit "gateway fees are
    separate" copy.
11. Updated seed data: real Starter/Business/Pro values (50/2/0.50%,
    250/5/0.40%, 1000/15/0.25%) matching the specified business model — Pro
    previously had unlimited products/staff, now explicitly 1,000/15 as specified.
    Also fixed the three demo stores' `planTier` from a stray `'growth'` placeholder
    (matched no real package, silently fell back to Starter-equivalent limits) to
    `'business'`, so demo data actually exercises the real plan system.

## C. Database Changes

- `Package.platformFeeRate` — `Decimal(6,4)`, default 0.
- New enum `BillingPeriodStatus` (OPEN, CLOSED).
- New enum `BillingEntryType` (SUBSCRIPTION_CHARGE, PLATFORM_FEE, ADJUSTMENT, CREDIT,
  PAYMENT).
- New model `BillingPeriod` — one row per store per calendar month, with snapshotted
  `planName`/`subscriptionPrice`/`platformFeeRate`/`currency` plus running
  `eligibleGmv`/`platformFeeAmount` totals. Unique on `(storeId, periodStart)`.
- New model `BillingLedgerEntry` — append-only, typed, signed `amount`. Unique on
  `(storeId, referenceType, referenceId, type)` — the idempotency guarantee.
- `Store` gained `billingPeriods`/`billingLedgerEntries` relations.
- Migration: `packages/prisma/migrations/20260817124148_add_billing_ledger_and_platform_fee/`.
- Every new query is indexed and scoped by `storeId`; none of it touches any
  storefront-facing (customer) request path.

## D. Backend Changes

- `services/subscription.service.ts` — rewritten: fixed active-product counting,
  added storage tracking/enforcement, added `getStoreUsage` as one shared usage view.
- `services/billing.service.ts` (new) — period lifecycle, fee booking, refund
  adjustment, idempotency, read views. See `BILLING_ARCHITECTURE.md` for the full
  design rationale.
- `services/media.service.ts` — storage-limit check before persisting a new asset.
- `services/order.service.ts` — one new call, inside the existing `DELIVERED`
  transaction: `bookPlatformFeeForOrder`.
- `services/return.service.ts` — one new call, inside the existing refund
  transaction: `bookRefundAdjustment`.
- `services/package.service.ts` — schema extended with `platformFeeRate`.
- `lib/prisma.ts` — added shared `isUniqueConstraintError`, removed two duplicate
  local copies.
- `routes/admin.routes.ts`, `routes/store.routes.ts` — new usage/billing endpoints,
  all authenticated and role-scoped (billing routes restricted to
  STORE_OWNER/STORE_MANAGER/MASTER_ADMIN; usage routes open to the router's existing
  staff-role default).
- `packages/types` — new enums mirrored, three new `ApiErrorCode` entries.

## E. Frontend Changes

- **Admin-panel**: `PricingPage.tsx` (platform-fee % field, shown per-card);
  `StoreDetailPage.tsx` (new Usage card with progress bars, new Billing card with
  current period + history table); `BillingPage.tsx` (new — platform-wide billing
  rollup, replacing the old "Licenses" placeholder); `Sidebar.tsx` nav entry renamed
  Subscriptions → Billing.
- **Store-dashboard**: `PlanUsageCard.tsx` (new — products/staff/storage bars +
  current period estimate), added to `SettingsPage.tsx`.
- **Marketing**: `PricingSection.tsx` (homepage teaser) and `PricingPage.tsx` (full
  page) both now show "Up to N active products / N staff accounts / +X% platform fee"
  per plan, plus explicit "payment gateway charges are separate" copy.
- Limit-reached errors already carry a specific, human-readable message
  (`"You're using 50/50 products on the Starter plan. Upgrade your plan to add
  more."`) that reaches the UI through each page's existing generic error-toast
  handling — no new modal system was built, matching the spec's own "avoid annoying
  popups" guidance.

## F. Business Rules

- **Product limits**: Starter 50, Business 250, Pro 1,000, Enterprise custom (create a
  `Package` row with the negotiated limits — no code change needed). Counts `ACTIVE`
  products only.
- **Staff limits**: Starter 2, Business 5, Pro 15. Includes the store owner
  (pre-existing behavior, preserved).
- **Storage limits**: Starter 500MB, Business 2000MB, Pro 10000MB (pre-existing seed
  values, left as-is — already reasonable given the platform's 10MB-per-file ceiling
  and realistic product-image volumes at each tier).
- **Platform fee**: Starter 0.50%, Business 0.40%, Pro 0.25%, Enterprise
  configurable/negotiated.
- **Eligible GMV**: `subtotal − discountAmount`, delivery excluded. See
  `BILLING_ARCHITECTURE.md` §5.2 for the full reasoning.
- **When the fee applies**: only on orders that reach `DELIVERED` — never on
  cancelled, failed-payment, or pre-delivery-returned orders. Applies identically to
  COD and MANUAL_BKASH.
- **Refunds**: a refund of `X`% of an order's total reverses `X`% of that order's
  already-booked fee, via a new negative ledger entry — the original entry is never
  edited.
- **Billing periods**: one per store per calendar month, opened lazily, pricing
  snapshotted at open time so later `Package` edits never retroactively change an
  already-open or historical period.

## G. Testing

New file `apps/api/src/billing-usage.test.ts` — **18/18 passing**:

| Area | Test | Result |
|---|---|---|
| Seed data | Starter/Business/Pro match the specified limits and fee rates | PASS |
| Active product definition | DRAFT/ARCHIVED excluded, ACTIVE counted | PASS |
| Product limit | Allows up to the limit, rejects one past it, structured error | PASS |
| Product limit | `null` limit means unlimited | PASS |
| Product limit | Archiving a product frees a slot | PASS |
| Staff limit | Owner alone fills a `maxStaff: 1` plan | PASS |
| Staff limit | Allows up to the limit, rejects one past it | PASS |
| Storage limit | Accepts under limit, rejects over, allows again after delete | PASS |
| Platform fee | Booked only at DELIVERED, on eligible value (delivery excluded) | PASS |
| Platform fee | Never booked for an order cancelled before delivery | PASS |
| Platform fee | Idempotent — double-booking produces exactly one entry | PASS |
| Refunds | Full refund fully reverses the fee; partial reverses proportionally | PASS |
| Refunds | Refunding an order with no fee is a safe no-op | PASS |
| Billing periods | An open period keeps its rate after the Package rate changes | PASS |
| Billing periods | Exactly one SUBSCRIPTION_CHARGE booked per period | PASS |
| Usage view | Reflects products/staff/storage against plan limits | PASS |
| Tenant isolation | One store's usage/billing never includes another's | PASS |
| Plan changes | Downgrading below current usage never deletes existing products | PASS |

**Regression**: full suite **119/119 passing** (101 pre-existing + 18 new), 0 failed.
All 7 workspaces (`types`, `prisma`, `api`, `admin-panel`, `store-dashboard`,
`storefront`, `marketing`) build clean via `npm run build`.

**Live verification** (Playwright against the running dev stack): marketing pricing
pages show the correct per-plan limits and fee percentages (0.50%/0.40%/0.25%); admin
Pricing page's platform-fee field loads and saves correctly; admin Store Detail page's
Usage and Billing cards render with live data; admin's new platform-wide Billing page
loads with no console errors; store-dashboard's Plan & Usage card renders and its
displayed numbers were cross-checked directly against the `/api/store/:id/usage`
response and the real product list — they matched exactly (3/250 products,
matching the corrected seed data).

## H. Remaining Decisions

- **Enterprise plan**: no placeholder `Package` row was pre-seeded (deliberately — a
  fabricated "custom" row with made-up numbers would look like a real sellable plan on
  the public pricing page before any actual enterprise deal exists). Master Admin can
  create one anytime via the existing `/admin/packages` UI, `active: false` until
  ready. **Decision needed**: should an inactive Enterprise placeholder exist by
  default, and if so, what should its `active`/`featured` defaults be?
- **Actual subscription payment collection**: the ledger correctly models what a
  store owes each period, but nothing in this codebase actually charges a merchant for
  it — there is no recurring-billing payment gateway integration today (bKash/COD are
  order-level customer-checkout methods only). **Decision needed**: what should
  collect the monthly subscription + fee total — a manual invoice/bKash-transfer
  workflow (mirroring how order payments already work), or a real payment gateway
  integration, and on what timeline.
- **Legacy/grandfathered pricing**: the snapshot-per-period design means changing a
  `Package`'s price/fee never retroactively affects an already-open period, but there
  is currently no way to give one *specific* store a permanently different rate than
  its plan's public rate (e.g. honoring an old price for an early customer
  indefinitely). **Decision needed**: is this needed, and if so, the natural extension
  is an optional per-store override field read at period-open time — not built now
  since no such case exists yet.
- **Bandwidth/traffic and infrastructure-cost tracking**: intentionally not built —
  the spec asked only that the architecture not preclude it later. No code changes
  were made in this area since it would mean either fabricating data (explicitly
  forbidden) or standing up real infrastructure-metrics collection (out of scope for
  this task).

## I. Phase 3 — Invoice & Merchant Payment System

Answers the "actual subscription payment collection" decision above with a manual
bKash/bank-transfer + Master Admin verification workflow. Full design in
`BILLING_ARCHITECTURE.md` §10; business decisions in the approved
`MERCHANT_PAYMENT_ARCHITECTURE_PROPOSAL.md`.

**New models**: `Invoice` (snapshot of a closed `BillingPeriod`, human-readable
`CN-YYYY-MM-NNNNNN` numbering via a Postgres `SEQUENCE`, immutable
`subscriptionAmount`/`platformFeeAmount` once issued) and `MerchantPayment` (manual
bKash/bank-transfer claims, `PENDING_VERIFICATION → APPROVED/REJECTED/CANCELLED`,
entirely separate from `Order`'s customer-checkout payment fields). Merchant credit
reuses the existing `BillingLedgerEntry.CREDIT` type, now signed both ways
(issued/consumed) instead of adding a new model.

**Concurrency & idempotency** (the explicit focus of this phase): invoice generation
is safe under literal concurrent calls (DB unique constraint + P2002-catch, not an
app-level check); payment verification re-checks status inside a `withStoreLock`
before booking anything, making double-click/duplicate-approval collapse to one
winner; duplicate transaction references are blocked by a partial unique index, not
application logic. One real concurrency bug was found and fixed *during* this phase:
`getOrCreateCurrentBillingPeriod` (pre-existing, from an earlier phase) had an
unhandled race on period creation, only exposed once this phase's tests exercised
concurrent invoice generation against it — now idempotent the same way everything
else in the ledger already was.

**Routing note**: new merchant-payment routes live under `/merchant-payments`, not
`/payments` — this codebase already has customer-order bKash verification routes at
`/payments/*`, and Express matches by registration order, so reusing that prefix would
have silently made the new routes unreachable (caught by live HTTP verification
against the running dev stack, not by the test suite, which calls services directly
for most cases).

**Tests**: 25 new tests (`invoice-payment-billing.test.ts`) covering invoice
generation/idempotency/numbering/snapshot/due-date, payment claim/approval/rejection/
duplicate-reference/under/over/exact payment, credit issuance/application/tenant-
isolation, late-refund CASE A/B/C, and security (cross-store denial, non-admin
verification rejection). Full suite: 170/170 passing (145 pre-existing + 25 new).
Live-verified end-to-end against the running dev stack and real dev database (not
just the test DB): closed a real billing period, generated a real invoice, submitted a
real payment claim, confirmed a non-admin token is rejected from verification,
approved it as Master Admin, confirmed double-approval is rejected, and confirmed the
invoice and platform billing summary reflect the verified payment correctly.

**Remaining limitations, stated plainly**: no automated bKash/gateway API exists or is
claimed to exist — V1 is manual claim submission + Master Admin verification only.
No automatic suspension/restriction on overdue invoices. No PDF invoice generation
(web-based statement only, per explicit instruction not to build this).

## J. Phase 4 — QA audit: real merchant/Master Admin experience

A full audit of the billing *experience*, not new architecture — full detail in
`BILLING_ARCHITECTURE.md` §11. Two real, pre-existing correctness bugs were found and
fixed; the rest was UX/transparency polish on an already-correct backend.

**Bugs found and fixed** (both were real, not hypothetical — confirmed with new tests
and live HTTP verification against the running dev stack):
1. **CRITICAL**: trial stores were accruing real subscription charges and platform
   fees from day one of their free trial (`getOrCreateCurrentBillingPeriod` never
   checked `Store.isTrial`). Fixed — trial periods now open with zero pricing;
   converting to paid never retroactively charges the already-open trial period.
2. **HIGH**: Master Admin's platform-wide billing views (`listAllInvoices`,
   `getPlatformBillingSummary`) never triggered invoice generation for a store nobody
   had individually viewed, so totals could silently understate reality. Fixed with a
   platform-wide equivalent of the existing per-store lazy-generation trigger.

**Gaps found and fixed** (not bugs in the financial logic, but the feature was
effectively unusable without them):
3. **HIGH**: no UI existed for Master Admin to configure the bKash/bank payment
   instructions merchants need — only a raw API call could set them. Added a
   "Merchant billing" card to the existing Settings page.
4. **HIGH**: the merchant-facing invoice showed a platform-fee amount with no rate or
   explanation. Added server-supplied `platformFeeRate`/`eligibleGmv` to the invoice
   response and a plain-language explanation on the Store Admin Billing page.

**UX polish** (Phase 23 MEDIUM, fixed because the changes were safe and localized):
merchant-friendly status labels instead of raw enum names; a rejected payment's
reason now shown proactively on the current-invoice card with a "submit corrected
payment" CTA; an explicit OVERDUE warning banner; Master Admin Store Detail page now
shows that store's payment history, not just its invoices; Master Admin gets an
in-app notification when a merchant submits a claim (reusing the existing
`Notification` model — no new infrastructure); a discoverability link from the
existing Plan & Usage card to the full Billing page.

**Confirmed correct and left unchanged**: all §10 financial-integrity/security
guarantees; downgrade-over-limit messaging; lazy invoice generation itself (the
*trigger coverage* had a real gap, fixed above — laziness itself was never the
problem, and no scheduled-job infrastructure was added); trial-to-paid conversion's
preservation of all store data (products/themes/customers/orders were never touched
by `convertTrial` to begin with).

**Tests**: 4 new (3 trial-billing, 1 platform-wide-generation), added to the existing
`billing-usage.test.ts` and `invoice-payment-billing.test.ts` files rather than a new
file. Full suite: **174/174 passing** (170 previous + 4 new). All 7 workspaces build.
