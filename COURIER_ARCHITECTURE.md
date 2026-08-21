# CommerceNest — Courier Integration Architecture (Phase 6)

This document explains the courier/shipment system: the provider abstraction, why
Steadfast was chosen as the first integration, how credentials are secured, how
courier-driven events feed into the existing order-lifecycle state machine, and what
is explicitly **not** built yet.

## 1. Scope of this phase

Before this phase, CommerceNest had `Order.courierName` / `Order.courierTrackingId` —
free-text fields a staff member typed in by hand, with no real courier API involved.
That manual path still exists (see §7) as a fallback for couriers without a live
integration. This phase adds:

- A `CourierProvider` abstraction (`apps/api/src/services/courier/types.ts`) — one
  interface every courier adapter implements, so adding a second courier later is a
  new adapter file + one registry line, not a rewrite.
- One real adapter: Steadfast Courier (`steadfast.provider.ts`).
- Per-store courier configuration (`CourierAccount`) with encrypted-at-rest
  credentials, managed from Store Admin → Settings → Delivery.
- A `Shipment` model tying an `Order` to a real courier consignment, with
  CommerceNest's own normalized status vocabulary.
- Automatic order-status advancement driven by real shipment events (creation,
  polling sync, webhook) — reusing the existing hardened `transitionOrderStatus`
  state machine rather than duplicating its logic.
- Customer-facing shipment status on the order-tracking page (no credentials, no
  internal courier API details ever reach the storefront).

**Not built in this phase** (deliberately, per the original brief): a second/third
courier, shipment cancellation (Steadfast's public API has no merchant-facing cancel
endpoint — see §6), and COD settlement/reconciliation accounting. See §9.

## 2. Why Steadfast first

The brief was explicit: build one courier well rather than three shallowly. Steadfast
was chosen over Pathao and RedX for one concrete reason — its authentication is a
static `Api-Key` / `Secret-Key` pair issued directly from the merchant's own Steadfast
dashboard (Settings → API Support), with no OAuth token-refresh flow and no multi-day
merchant-approval/trade-license process before credentials even exist. Pathao and RedX
both require a merchant onboarding/approval step with their business teams before API
access is granted, which would have blocked this phase on an external, non-technical
dependency. Steadfast also has published, stable REST endpoints for order creation,
status lookup, and balance check, and supports COD out of the box (`cod_amount` on
order creation) — the dominant payment method for CommerceNest's Bangladesh merchants.

## 3. The `CourierProvider` boundary

`services/courier/types.ts` defines the interface every adapter implements:
`createShipment`, `trackShipment`, `cancelShipment`, `testConnection`,
`verifyWebhook`, `parseWebhookPayload`, plus static metadata (`credentialFields`,
`supportsCancel`). This mirrors `lib/sms.ts`'s `SmsProvider` boundary — the same shape
of problem (one normalized interface, provider-specific detail isolated behind it) —
so nothing outside `services/courier/` ever imports a provider file directly.
`registry.ts` maps a `CourierAccount.provider` string to its adapter; `provider` is a
plain string column (like `Store.planTier`), not a Prisma enum, so registering a new
courier is a code change, never a migration.

Three typed errors distinguish failure modes callers (and tests) need to tell apart:
`CourierNotConfiguredError` (nothing to try — no enabled account), `CourierDeliveryError`
(a real API call was attempted and failed), and `CourierUnsupportedOperationError` (the
operation isn't offered by this provider's public API at all).

## 4. Normalized shipment status

Every courier has its own status vocabulary. Rather than exposing Steadfast's raw
strings (`delivered_approval_pending`, `partial_delivered_approval_pending`, ...)
throughout the app, `Shipment.status` uses CommerceNest's own `ShipmentStatus` enum
(`CREATED | IN_REVIEW | PICKED_UP | OUT_FOR_DELIVERY | DELIVERED | PARTIAL_DELIVERED |
ON_HOLD | CANCELLED | RETURNED | FAILED`), and each adapter maps its raw values into
it (`steadfast.provider.ts#mapStatus`). The original raw string is preserved
separately on `Shipment.rawStatus` — nothing is lost in normalization, and a future
adapter only needs to write its own mapping function, never touch the enum. An
unrecognized/future Steadfast status value maps to `FAILED` rather than throwing,
since a courier adding a new status string in the future must never crash a sync.

`PICKED_UP` and `OUT_FOR_DELIVERY` exist in the enum for other couriers' vocabularies
but have no Steadfast source value today — Steadfast's public API does not
distinguish these from `IN_REVIEW`/`pending`.

## 5. Credentials — encryption at rest

Courier API keys are the first *reversible* secret this codebase has needed to store
— everything before this (passwords, session tokens) only ever needed one-way hashing
via `lib/password.ts`. `lib/crypto.ts` adds AES-256-GCM encryption specifically for
this: `encryptJson`/`decryptJson`, keyed via `scryptSync` derivation from
`CREDENTIALS_ENCRYPTION_KEY` (a new env var, deliberately separate from the JWT
secrets so rotating one never force-invalidates the other). GCM is authenticated
encryption — a tampered ciphertext or auth tag throws on decrypt rather than silently
returning garbage credentials.

`CourierAccount.credentialsEncrypted` is the only place credentials are stored.
Decryption happens in exactly one file (`courier.service.ts`), immediately before an
actual provider API call — never in a serializer, never in a route handler response.
Every function that returns account data to a client
(`serializeCourierAccount`/`listCourierAccounts`/`upsertCourierAccount`) explicitly
omits both the encrypted blob and any decrypted value. This is asserted directly by
tests (`courier.test.ts`), not just by code review: credentials never appear, encrypted
or plaintext, in any serialized response.

## 6. Order-lifecycle integration — reusing, not duplicating

Rather than writing new order-mutation logic for courier-driven transitions,
`courier.service.ts` calls the *existing* `transitionOrderStatus` (the same function
staff actions use), so every guarantee that function already has — atomic stock
handling, platform-fee booking on `DELIVERED`, audit history, event emission — applies
to courier-triggered transitions automatically:

- **Shipment created** while the order is `CONFIRMED` → auto-advances to
  `PROCESSING`. Best-effort: if the courier call succeeded but this secondary
  transition fails for any reason, the shipment is still recorded as created and the
  failure is only logged — a real, already-placed courier consignment must never be
  rolled back because of CommerceNest's own bookkeeping hiccup.
- **`SHIPPED`** is never automated. The courier's API has no reliable "physically
  picked up by rider" signal to trust for this transition, so it stays a deliberate
  staff action, same as before this phase.
- **Courier reports `DELIVERED`** while the order is `SHIPPED` → auto-advances to
  `DELIVERED` (booking the platform fee, same as a staff-driven `DELIVERED`).
- **Courier reports `CANCELLED`** → `CONFIRMED`/`PROCESSING` auto-advances to
  `CANCELLED`; `SHIPPED` auto-advances to `RETURNED` instead, since
  `ORDER_TRANSITIONS` has no `SHIPPED → CANCELLED` edge and "refused/undelivered
  after shipping" is what `RETURNED` already represents.
- Every other reported status (`IN_REVIEW`, `ON_HOLD`, ...) updates `Shipment.status`
  only — no order-lifecycle meaning is asserted for it.

`transitionOrderStatus`'s actor type was widened from `{ id: string }` to
`{ id: string | null }` to support these system-triggered calls (courier sync/webhook
have no human actor); `id: null` skips the `OrderConfirmed` event emission, which only
makes sense for the human-driven `PENDING → CONFIRMED` step.

### 6.1 Idempotency

Both the polling "Sync status" action and the incoming webhook funnel through one
shared function, `applyShipmentStatusUpdate`: it compares the courier's reported
status to what's already stored, and only writes / triggers an order transition when
it actually changed. A courier's retried or duplicate webhook delivery is therefore a
guaranteed no-op — not "usually," by construction. This is proven directly by tests
that call the same sync/webhook twice with an unchanged status and assert no second
order transition occurs.

### 6.2 Why shipment cancellation isn't wired into the UI

Steadfast's public API documentation has no merchant-facing "cancel consignment"
endpoint — cancellation on their side is a dashboard/support action, not an API call.
`steadfastProvider.cancelShipment` reflects this honestly: it always throws
`CourierUnsupportedOperationError` rather than faking success, `supportsCancel` is
`false`, and the Store Admin UI does not offer a "Cancel shipment" button in V1 as a
result (`CourierProvider.supportsCancel` exists specifically so the UI can gate this
per-provider once a courier that *does* support it is added).

## 7. Manual courier fields — kept as a fallback

`Order.courierName` / `Order.courierTrackingId` (pre-existing, staff-typed) are kept
and still shown in the order drawer, relabeled "Manual courier details" with an
explanatory note. They remain useful for a courier CommerceNest has no live
integration with, or as an override. A real `Shipment` also writes into these same two
fields on creation (`courier.service.ts#createShipmentForOrder`) so any existing
display/logic depending on them keeps working unmodified.

## 8. Webhook handling

`POST /api/public/webhooks/courier/:storeId/:provider` (public, unauthenticated by
CommerceNest's own session system — the courier isn't one of our users). Scoped by
`storeId`+`provider` in the URL; authenticated instead via the provider's own scheme,
delegated to `CourierProvider#verifyWebhook`. For Steadfast this is a plain
`Authorization: Bearer <token>` comparison against an optional `webhookToken` field
configured per store. Once a courier account is connected, Settings → Delivery shows
the exact webhook URL (`.../api/public/webhooks/courier/<storeId>/<provider>`) with a
copy button, for the merchant to paste into their Steadfast dashboard. **Known limitation, documented rather than hidden:** if a store
never configures a webhook token, `verifyWebhook` returns `true` unconditionally — the
URL's `storeId`+`provider` segments are the only scoping available in that case, since
there is nothing to verify a signature against. Configuring a webhook token is
recommended in the Store Admin UI copy but not currently enforced as mandatory.

A malformed or unrecognized payload — not a signature failure, a *shape* CommerceNest
doesn't recognize, or a reference to a shipment CommerceNest has no record of — is
logged and answered with `{ ok: true, ignored: true }`, never thrown as an error. A
webhook endpoint must always return success to a legitimate-but-unexpected delivery,
or the courier's platform may disable/retry it aggressively.

**Known limitation:** Steadfast's public documentation specifies the `status_by_*`
response shape precisely but does not publish an exact webhook payload schema.
`parseWebhookPayload` assumes the webhook uses the same field names
(`consignment_id`, `tracking_code`, `delivery_status`) on the reasonable premise that a
status-push event mirrors the status-pull response — this is *unverified against a
live payload* and should be confirmed the first time a merchant has a real webhook
configured. Until then, the polling "Sync status" action in the order drawer is the
proven path and does not depend on this assumption at all.

## 9. Explicitly out of scope for this phase

- **A second/third courier** (Pathao, RedX, ...). The abstraction is built for this,
  but per the brief, only one courier ships now.
- **Shipment cancellation** — see §6.2.
- **COD settlement/reconciliation** (Order → Courier → Delivered → COD collected →
  Settlement → Merchant). `Shipment.codAmount` is recorded at creation time so this
  data exists for a future phase to build on, but no reconciliation, payout, or
  ledger logic against it exists yet — Steadfast's public API does not expose a
  straightforward COD-remittance feed, and the brief explicitly scoped this out unless
  the chosen provider made it easy.
- **Delivery-charge quoting** — `Shipment.deliveryCharge` exists as a column for a
  future "get delivery charge" feature but is not populated; Steadfast's
  `create_order` response does not return one, and no separate rate-quote endpoint is
  called.

## 10. Files

- `packages/prisma/schema.prisma` — `CourierAccount`, `Shipment`, `ShipmentStatus`.
- `apps/api/src/lib/crypto.ts` — AES-256-GCM encryption at rest.
- `apps/api/src/services/courier/types.ts` — the `CourierProvider` interface.
- `apps/api/src/services/courier/steadfast.provider.ts` — the Steadfast adapter.
- `apps/api/src/services/courier/registry.ts` — provider lookup.
- `apps/api/src/services/courier/courier.service.ts` — orchestration: account CRUD,
  shipment creation/sync, webhook handling.
- `apps/api/src/routes/store.routes.ts` — courier config + shipment routes
  (Store Admin, authenticated).
- `apps/api/src/routes/public.routes.ts` — the courier webhook route (unauthenticated
  by CommerceNest, scoped by store+provider, verified by the provider's own scheme).
- `apps/store-dashboard/src/components/CourierSettingsCard.tsx` — Settings → Delivery
  UI (generic across providers via `credentialFields`).
- `apps/store-dashboard/src/pages/OrdersPage.tsx` — shipment creation/sync UI in the
  order drawer.
- `apps/storefront/src/pages/TrackOrderPage.tsx` — customer-facing shipment status
  (provider name, tracking code, normalized status — never credentials or API
  details).
- `apps/api/src/services/courier/steadfast.provider.test.ts`,
  `apps/api/src/courier.test.ts` — test coverage.
