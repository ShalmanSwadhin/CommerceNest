# CommerceNest — Authentication, Verification & Approval Architecture

This document explains the design of CommerceNest's identity system: how storefront
customers, merchants (Store Owners / Staff), and Master Admin relate to
**authentication**, **verification**, and **approval** — three axes that are easy to
conflate but are deliberately kept independent.

## 1. Three separate concepts

| Concept | Question it answers | Where it lives |
|---|---|---|
| **Authentication** | "Can this person log in?" | `User.passwordHash` / `Customer.passwordHash`, JWT session |
| **Verification** | "Do we know this email/phone really belongs to them?" | `emailVerified`, `phoneVerified` booleans on `User` and `Customer` |
| **Approval** | "Is Master Admin willing to let this store operate?" | `Store.approvalStatus` (`PENDING` / `APPROVED` / `REJECTED`) |

These three never set each other automatically. A merchant can register, log in
immediately, run an **unverified but approved** store, or be **verified but still
pending approval**. The only place these interact is at Master Admin's discretion
(they can see verification status while deciding whether to approve).

This is enforced in code, not just by convention — `approveStore` /
`rejectStoreApproval` (`apps/api/src/services/store.service.ts`) touch only
`Store.approvalStatus`, `approvedById`, `approvedAt`, `approvalReason`. They never
write to `emailVerified` / `phoneVerified`. Conversely, `verification.service.ts`
never touches `Store.approvalStatus`. A dedicated test
(`authentication-verification.test.ts`) asserts both directions stay independent.

## 2. Storefront customers — password-first, verification optional

Customers register with name + email + password (`POST /storefront/:storeSlug/auth/register`)
and are immediately usable — no forced OTP, no forced email click. `Customer.phone`
is nullable specifically to support this (phone is only required for the pre-existing
OTP-login path, not for password registration).

Phone OTP login (`/auth/otp/request` + `/auth/otp/verify`) remains a fully independent
second login method — untouched, not deprecated. A customer can use either method
interchangeably; both resolve to the same `Customer` row when the phone/email match.

Once logged in (by either method), a customer can optionally verify their email
and/or phone from `/account` (`VerificationSection.tsx`) via:

- `POST /account/email-verification/send` + `POST /account/email-verification/verify`
- `POST /account/phone-verification/send` + `POST /account/phone-verification/verify`

These are purely cosmetic/trust signals in this build — nothing is gated behind them
(no billing, no "verified" badge requirement to check out). They exist because the
spec asked for the *capability*, not because any flow currently requires it.

## 3. Merchant trial → account → approval

`POST /public/trial` (existing endpoint, extended) now requires `password` +
`confirmPassword`. It creates the `Store` (with `approvalStatus: PENDING`) and the
owner `User` as `ACTIVE` with a real password hash — the owner can log into
store-dashboard immediately with that password. This closes a pre-existing dead end
where trial owners were created `INVITED` with an invite token that was never
delivered anywhere.

The trial store's URL keeps its existing **random, non-business-derived slug**
(`generateUniqueTrialSlug()` in `trial.service.ts`) — deliberately unchanged, since a
trial link must not leak the prospect's business name before they've committed to
anything. See section 5 for how a nicer address is obtained later.

`Store.approvalStatus` starts `PENDING` for every new trial. The store and dashboard
work immediately regardless of approval status in this build — approval is a
Master Admin visibility/control lever (`StoresPage.tsx`: Approve / Reject buttons),
not a functional gate. Master Admin can approve a store whose owner has never
verified email or phone, and can reject an already-verified one — see section 1.

## 4. Merchant (User) verification

Identical shape to customer verification, same `verification.service.ts` and same
`lib/otp.ts` core, just keyed by `EmailVerificationSubject.USER` instead of
`CUSTOMER`. Routes live on `apps/api/src/routes/auth.routes.ts`:
`/email-verification/send`+`/verify`, `/phone-verification/send`+`/verify`. Surfaced
in store-dashboard via `MerchantVerificationCard.tsx` on the Settings page.

## 5. Shared verification infrastructure

### Email
`packages/prisma` — one `EmailVerificationToken` table for both subject types
(`EmailVerificationSubject.USER | CUSTOMER`), rather than duplicating columns on two
models. A 256-bit random token is generated with `randomBytes(32)`; only its SHA-256
(`hashLookupToken()`, `apps/api/src/lib/password.ts`) is stored, so a database read
alone can't be replayed as a working token. SHA-256, not bcrypt: bcrypt exists to slow
down brute-forcing a *small* keyspace (a password, a 6-digit OTP) and can't be looked
up by value in a `WHERE` clause at all — a 256-bit token's security comes from its
keyspace size, and it must be looked up directly, so a fast deterministic hash is the
textbook-correct choice, not the wrong one.

Delivery reuses the pre-existing `sendEmail()` (`apps/api/src/lib/email.ts`, already
used for order-status emails) — no second email-sending implementation. In
development/test, `sendEmail()` logs instead of connecting to real SMTP, and the API
response includes `devToken`/`devLink` so flows are testable without a mailbox. In
production, `sendEmailVerification()` throws `503 EMAIL_UNAVAILABLE`
(`AppError.serviceUnavailable`) if `SMTP_HOST`/`SMTP_USER`/`SMTP_PASSWORD`/`SMTP_FROM`
aren't all set — the exact same fail-closed philosophy `lib/sms.ts` already applies to
OTP delivery, applied consistently rather than silently pretending an email was sent.

### Phone
`apps/api/src/lib/otp.ts` is the single OTP primitive (generate, hash, store with TTL,
rate-limit attempts, enforce resend cooldown, send via the existing `SmsProvider`
abstraction, consume). Both the public storefront OTP-login flow
(`storefront.service.ts#requestOtp/verifyOtp`) and the new authenticated phone
verification flow (`verification.service.ts#sendPhoneVerificationOtp/confirmPhoneVerificationOtp`)
call these exact same functions with different Redis key namespaces
(`otp:login:...` vs `otp:phoneverify:...`) — not two OTP systems.

## 6. Domain requests — a new, separate namespace

This is **not** the existing self-service custom-domain flow (Store Settings →
"custom domain", where a merchant adds their own already-owned domain and verifies
DNS records themselves, no admin involved). This is a curated allocation of a
`*.commercenest.<tld>` address:

1. Merchant checks availability: `GET /store/domain-requests/check?label=...` →
   `checkDomainLabelAvailability()` (`domain.service.ts`) — server-side authoritative,
   checks both existing `StoreDomain` rows and any active (`PENDING`/`APPROVED`)
   `DomainRequest` rows, plus a reserved-word list (`www`, `admin`, `app`, `api`,
   `store`, ...). The frontend never decides "available" on its own.
2. Merchant requests it: `POST /store/domain-requests` → creates a `DomainRequest`
   row (`status: PENDING`). Any prior pending request from the same store is
   auto-rejected first (one live request per store at a time).
3. Master Admin reviews (`DomainRequestsPage.tsx` / `GET /admin/domain-requests`):
   **Approve** (marks `APPROVED`, doesn't create the domain yet), **Assign**
   (`POST /admin/domain-requests/:id/assign` — creates the real `StoreDomain` row
   directly as `VERIFIED`/`ACTIVE` inside a transaction, since an admin-assigned
   domain is trusted the same way the auto-provisioned trial subdomain is, with no
   DNS challenge needed), or **Reject** (with an optional reason shown to the
   merchant).

`DomainRequest.status` (`PENDING`/`APPROVED`/`REJECTED`/`ASSIGNED`) is a different
enum from the pre-existing `StoreDomain.status` (`PENDING`/`VERIFIED`/`FAILED`/
`SUSPENDED`), which describes a domain that already exists and is going through (or
has gone through) DNS/SSL provisioning. A `DomainRequest` becoming `ASSIGNED` is what
produces a new `StoreDomain` row — the two models describe different stages.

## 7. What this build deliberately does NOT do

- No billing/subscription gate tied to approval or verification.
- No real DNS/registrar integration — "assigning" a domain means creating a
  `StoreDomain` row the platform's own request routing already understands
  (`scripts/dev-gateway.mjs` in dev; the same host-based resolution in production),
  not registering anything with an external registrar.
- Approval/verification don't block any existing functionality — they're additive
  status fields and an admin review queue, not new authorization gates on existing
  routes.
