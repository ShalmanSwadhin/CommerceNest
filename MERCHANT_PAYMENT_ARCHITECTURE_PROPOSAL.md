# Merchant Payment Collection — Architecture Proposal

**Status: proposal only — nothing in this document is implemented yet.** Per the
explicit instruction accompanying this phase, no Invoice/Payment code, migration, or
route exists in the codebase as of this document. This exists so the design can be
reviewed before Phase 3 begins.

## 0. The two payment directions, kept separate

| | Customer → Merchant | Merchant → CommerceNest |
|---|---|---|
| What | Customer pays for an order | Merchant pays their monthly bill |
| Existing model | `Order` (+ its `bkash*` fields) | None yet |
| Revenue belongs to | The merchant | CommerceNest |
| This proposal touches | Not at all | Everything below |

Nothing in this proposal reads, writes, or reuses `Order`, `OrderItem`, or the
`bkash*` fields on `Order`. A new, small, parallel set of models represents the
merchant-billing side. This is the single most important structural decision here —
it's what the task explicitly demanded, and it's also what the audit above shows is
already true of the *existing* system (bKash-on-`Order` is unambiguously
customer-facing; nothing about it generalizes to "CommerceNest receives money").

## A. Recommended flow

```
BillingPeriod (exists)
      ↓  issued once, near period-close or on demand
Invoice (new)  — snapshotted amount, human-readable number, DRAFT→ISSUED
      ↓
Merchant sees invoice in Store Admin, clicks "Submit Payment"
      ↓
MerchantPayment (new) — status PENDING_VERIFICATION, holds provider + reference
      ↓
Master Admin reviews the submitted reference (same UX pattern as
verifyBkashPayment — a list of pending items, Approve/Reject)
      ↓
Verified → MerchantPayment.status = VERIFIED (immutable once set)
      ↓
BillingLedgerEntry (type: PAYMENT) created — idempotent, keyed by MerchantPayment.id
      ↓
Invoice.amountPaid updated from the ledger; status recalculated
(PAID / PARTIALLY_PAID) — never set by the frontend, never set directly by the
verification action itself
```

This is deliberately the *same shape* as the existing customer-order bKash flow
(submit reference → human verifies → status flips), reusing a pattern the team
already operates today, not introducing a new mental model. The difference is who's
paying whom and what table it lands in.

### Why not "automated" from day one

No real payment gateway exists in this codebase or in `package.json`, and the task
explicitly says not to assume Stripe or bKash's real API. Building a fake automated
flow would mean either (a) silently trusting client-reported "payment succeeded"
(explicitly forbidden — Phase 10) or (b) pretending to integrate a gateway that isn't
there. The honest, buildable option today is the manual-verification pattern — with
the data model shaped so a real gateway integration *later* is additive (a new
`provider` value + a webhook handler that creates the same `MerchantPayment` +
`BillingLedgerEntry` records through the same verification function), not a rewrite.

## B. Data model

```
BillingPeriod (existing, unchanged)
  1 ─── 0..1 → Invoice
                 │
                 │ 1
                 │
                 ▼ 0..N
              MerchantPayment
                 │
                 │ on verification, exactly one
                 ▼
         BillingLedgerEntry (type: PAYMENT)
```

**`Invoice`** (new) — "CommerceNest is asking this merchant to pay this amount."
One per `BillingPeriod` (nullable/optional relation on `BillingPeriod`, not the other
way around, so a period can exist before an invoice is issued for it).

| Field | Notes |
|---|---|
| `id` | cuid, internal |
| `invoiceNumber` | Human-readable, unique, immutable once issued — see §Phase 3.2 below |
| `storeId` | Direct column, not just inferred through `billingPeriod` — every tenant-scoped query filters on this directly, matching the existing `BillingLedgerEntry` convention |
| `billingPeriodId` | FK, unique (one invoice per period) |
| `issueDate`, `dueDate` | `dueDate` derived from a configurable "days to pay" (Phase 7 territory — not decided here) |
| `currency` | Matches `BillingPeriod.currency` |
| `subscriptionAmount`, `platformFeeAmount`, `adjustmentAmount` | **Copied from the `BillingPeriod` at issue time**, not read live — see snapshot rule below |
| `totalAmount` | `subscriptionAmount + platformFeeAmount + adjustmentAmount` |
| `amountPaid` | Derived/maintained from verified `MerchantPayment` + `BillingLedgerEntry` rows, never set directly by any "mark paid" shortcut |
| `amountDue` | `totalAmount - amountPaid` (computed, not stored, to avoid a second source of truth going stale) |
| `status` | `DRAFT \| ISSUED \| PARTIALLY_PAID \| PAID \| OVERDUE \| VOID` — see §Phase 3.4 |
| `createdAt`, `updatedAt` | Standard |

**Snapshot rule, extended**: `BillingPeriod` already snapshots plan pricing when the
period *opens*. `Invoice` snapshots the period's *totals* when the invoice is
*issued* (a distinct, later moment — a period is still accumulating GMV/fees while
open; the invoice freezes a specific total to ask for). If `bookPlatformFeeForOrder`
or a refund adjustment somehow fires *after* an invoice is already issued (e.g. a
late-arriving refund on an already-invoiced period — exactly the "closed periods can
still receive adjustments" case already documented in `BILLING_ARCHITECTURE.md` §6),
the invoice's snapshotted total does **not** silently change; the new
`BillingLedgerEntry` still gets created (ledger stays complete and accurate) and the
discrepancy becomes a `CREDIT`/`ADJUSTMENT` line applied to the *next* invoice or a
manual credit — this needs explicit business sign-off before Phase 3 (see Open
Business Decisions).

**`MerchantPayment`** (new) — a submitted/verified payment attempt against one invoice.

| Field | Notes |
|---|---|
| `id` | cuid |
| `invoiceId`, `storeId` | Both direct columns |
| `provider` | `MANUAL_BKASH \| MANUAL_BANK_TRANSFER` initially — an enum, so adding `AUTOMATED_GATEWAY` later is additive |
| `providerReference` | The bKash txn ID / bank reference the merchant submits |
| `amount`, `currency` | What the merchant claims to have paid — `Prisma.Decimal`, never `number` |
| `status` | `PENDING_VERIFICATION \| VERIFIED \| REJECTED` |
| `submittedAt`, `verifiedAt`, `verifiedById` | Mirrors the existing `Order.paymentVerifiedAt/By` convention exactly |
| `rejectionReason` | Nullable, required when rejecting (mirrors `verifyBkashPaymentSchema`'s existing superRefine pattern) |

Append-only in spirit: once `VERIFIED` or `REJECTED`, a `MerchantPayment` row is not
flipped back — a correction is a new row (mirrors the ledger's own immutability rule).

**`BillingLedgerEntry`** (existing model, no schema change) — gains real use of the
already-defined `PAYMENT` type. A verified `MerchantPayment` creates exactly one
`PAYMENT` entry, `referenceType: 'MerchantPayment'`, `referenceId: <payment.id>` —
using the exact same idempotency mechanism (`@@unique([storeId, referenceType,
referenceId, type])`) already proven for `PLATFORM_FEE` and `ADJUSTMENT`. No schema
migration needed for this part — the model and the constraint already exist and
already support this.

**Relationship to `Subscription`**: there is no separate `Subscription` model in this
codebase (confirmed in the Phase 0 re-audit — `Store.planTier` + `Package` fill that
role, and `BillingPeriod` snapshots it). This proposal doesn't introduce one either;
`Invoice.subscriptionAmount` continues to come from `BillingPeriod.subscriptionPrice`.

## C. Idempotency

Every layer gets its own idempotency guarantee, not one shared mechanism papering
over all of them:

- **Same webhook/verification action fired twice** → `MerchantPayment` status
  transitions are guarded the same way order status transitions already are
  (`canTransition`-style: only `PENDING_VERIFICATION → VERIFIED` is legal; a second
  verification attempt on an already-`VERIFIED` row is rejected with a conflict, not
  silently re-applied).
- **Ledger entry created twice** → the existing `BillingLedgerEntry` unique
  constraint, keyed by `('MerchantPayment', payment.id, 'PAYMENT')`, makes a second
  attempt a no-op exactly like `bookPlatformFeeForOrder` already does — same
  `createLedgerEntry` helper, no new mechanism.
- **Invoice marked paid twice** → `Invoice.amountPaid`/`status` are never set
  directly by the verification action. They're derived by summing `PAYMENT` ledger
  entries for that invoice's `BillingPeriod` — since the ledger itself can't
  double-count (previous bullet), the derived total can't either. This also means
  there's no separate "mark invoice paid" write to accidentally run twice.

## D. Failure handling

| Case | Handling |
|---|---|
| Payment failed | `MerchantPayment.status = REJECTED` with `rejectionReason` — mirrors `verifyBkashPayment`'s rejection path exactly |
| Payment abandoned | Stays `PENDING_VERIFICATION` indefinitely — visible in Master Admin's pending queue (mirrors `listPendingBkashAllStores`); no auto-timeout invented here without a business decision on how long "abandoned" means |
| Webhook delayed | N/A at launch — no webhook exists yet; if/when a real gateway is added, its webhook creates a `MerchantPayment` in `PENDING_VERIFICATION` (or auto-verifies if the provider's callback is itself cryptographically verified) through the same code path a manual submission uses, not a separate one |
| Webhook duplicated | Same idempotency mechanism as above — a second identical callback finds the ledger entry already exists, no-ops |
| Wrong amount | `MerchantPayment.amount` is recorded as submitted; verification does **not** auto-mark the invoice `PAID` just because *a* payment was verified — `Invoice.status` is computed from `amountPaid` vs `totalAmount` (exact match → `PAID`; less → `PARTIALLY_PAID`; the reverse of overpayment below) |
| Partial payment | `amountPaid < totalAmount` → `status = PARTIALLY_PAID`, `amountDue` stays positive, merchant can submit another `MerchantPayment` against the same invoice |
| Overpayment | `amountPaid > totalAmount` — flagged, not silently absorbed. Recommended: `status` stays `PAID`, and the excess becomes a `CREDIT` ledger entry available against the *next* invoice, rather than lost or requiring an immediate refund. **This needs explicit business sign-off** (see Open Decisions) — "refund the difference" is a materially different policy than "credit it forward." |
| Payment reversed | Not auto-handled — a reversed manual bKash payment (rare, since it already cleared a human review) would need a Master Admin action creating a `CREDIT`/`ADJUSTMENT` entry, mirroring how order refund adjustments already work. No separate "chargeback" concept invented without a real gateway that could report one. |

## E. Merchant experience

- **Where the merchant sees their bill**: Store Admin gains a "Billing" page
  (extending the existing "Plan & Usage" card's neighborhood, not replacing it) —
  current invoice front and center (period, subscription, fees, adjustments, total,
  due date, status), matching the exact example in the task's Phase 5.
- **Where they see the invoice**: the same page, with a detail view per invoice
  (web statement — no PDF generation proposed yet, matching Phase 5's "not necessary
  for v1" guidance).
- **How they pay**: "Submit Payment" opens a form (provider selector, reference
  number, amount) — the same shape as the existing storefront bKash-submission form
  merchants already use as *customers* of that pattern in reverse, so the UX is
  familiar to build and to use.
- **How payment status appears**: `PENDING_VERIFICATION` shows as "Awaiting
  confirmation"; `VERIFIED` flips the invoice line to paid/partially-paid
  immediately (derived from the ledger, so there's no lag once Master Admin
  approves).
- **After successful payment**: invoice status updates, due amount drops (to zero
  for a full payment), and — once Phase 7 exists — any overdue/restricted state
  introduced by non-payment would lift automatically once `amountDue` reaches zero,
  driven by the same derived total, not a separate manual "reactivate" step.

## Security (Phase 10, addressed here since it shapes the model)

- `Invoice`/`MerchantPayment` are `storeId`-scoped exactly like `BillingLedgerEntry`
  already is — every query filters directly on the column, not through a join alone.
- The frontend never supplies `totalAmount`, `amountPaid`, `status`, or the
  `platformFeeRate` embedded in it — all read from `BillingPeriod`/`Invoice` server
  state, matching the existing "never trust frontend billing values" rule already
  enforced for `BillingPeriod`.
- Only Master Admin can transition a `MerchantPayment` to `VERIFIED`/`REJECTED` — a
  store's own staff can *submit* a payment (analogous to `STORE_OWNER`/
  `STORE_MANAGER` submitting bKash txns today) but never self-verify it, mirroring
  the existing separation between `submitBkashPayment` (any store role) and
  `verifyBkashPayment` (staff reviewing a *different* party's claim — here, Master
  Admin reviewing the merchant's claim, since the merchant is the interested party).

## Open Business Decisions

These need your explicit call before Phase 3 starts — implementing any of them
without a decision would be inventing business policy, which the task explicitly
warns against:

1. **Overpayment policy** — credit-forward vs. refund. (My lean: credit-forward,
   since no refund-to-merchant mechanism exists and building one is explicitly
   out of scope per Phase 13.)
2. **Days-to-pay / due date rule** — how many days after `issueDate` is `dueDate`.
   Not decided or defaulted here; feeds directly into Phase 7's overdue policy.
3. **When an invoice is issued** — automatically at period-close (would need the
   lazy-rollover model in `BILLING_ARCHITECTURE.md` §6 to gain a trigger point, or a
   light scheduled job) vs. manually by Master Admin vs. on-demand when the merchant
   first views their billing page. Each has different implications for "can a
   period still be open and un-invoiced simultaneously" — yes, by design, but the
   trigger needs to be picked.
4. **A late-arriving refund against an already-issued invoice** (see the Snapshot
   Rule note in §B) — does it adjust the *next* invoice, or can an issued invoice
   be amended pre-payment? Leaning toward "next invoice" to preserve invoice
   immutability once issued, but this is a real accounting-policy call, not a
   technical one.
5. **Manual bank transfer as a second provider alongside manual bKash** — the model
   above already supports it (`provider` enum) but no bank-account details/UI
   exist to collect; confirm this is wanted for v1 or deferred.

Nothing above has been implemented. This document is the "STOP HERE" checkpoint the
task specified — Phase 3 (the actual `Invoice`/`MerchantPayment` models, migration,
and endpoints) starts only after these are resolved.
