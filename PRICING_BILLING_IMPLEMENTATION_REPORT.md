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
