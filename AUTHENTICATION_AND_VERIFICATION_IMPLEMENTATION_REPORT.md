# Authentication, Merchant Verification, Trial & Domain System — Implementation Report

## 1. Executive Summary

CommerceNest now supports password-based storefront customer accounts (no forced
OTP/email verification), an independent merchant trial → account → approval pipeline,
optional email/phone verification for both customers and merchants that shares one
underlying implementation, and a new curated `*.commercenest` domain-request system
distinct from the existing self-service custom-domain flow. Approval and verification
are enforced as independent database axes, confirmed by a dedicated test. All 101
backend tests pass; all 7 workspaces build cleanly; every flow below was exercised
live in a real browser via Playwright against the dev stack, not just unit-tested.

During live verification a genuine, previously-undiscovered production bug was found
and fixed: `configureApiAuth()` was wired inside a `useEffect` in all three
authenticated frontend apps (storefront, store-dashboard, admin-panel), which logged
any already-logged-in user out on a plain page reload. See §14.

## 2. Architecture

See `AUTHENTICATION_ARCHITECTURE.md` for the full design write-up (verification vs.
approval independence, why SHA-256 not bcrypt for email tokens, why the OTP core was
extracted rather than duplicated, why the trial slug generator was left untouched, and
how the new domain-request system relates to the pre-existing custom-domain flow).
Summary: authentication (can they log in), verification (do we trust their
email/phone), and approval (`Store.approvalStatus`) are three independent axes that
never set each other automatically.

## 3. Trial Flow

`POST /public/trial` (`trial.service.ts`) now requires `password`/`confirmPassword`.
Duplicate owner emails are rejected up front with a clear message. The owner `User` is
created `ACTIVE` with a real bcrypt password hash (previously created `INVITED` with
an invite token that was never delivered — a dead end this closes). The new `Store` is
created with `approvalStatus: PENDING`. The trial URL keeps its existing random,
privacy-preserving slug — unchanged. The marketing success screen now links to the
merchant dashboard login.

## 4. Email Verification

New `EmailVerificationToken` table (shared by `USER` and `CUSTOMER` subjects). A
256-bit random token is minted per request; only its SHA-256 is stored
(`hashLookupToken()`); the token itself is only ever in the emailed link and the
dev-mode API response. Delivery reuses the pre-existing `sendEmail()` helper — no new
email-sending code. Dev/test always "succeeds" via `sendEmail()`'s existing log-only
stub; production throws `503 EMAIL_UNAVAILABLE` if `SMTP_HOST/USER/PASSWORD/FROM`
aren't all configured (same fail-closed pattern as `lib/sms.ts`).

## 5. Phone Verification

`apps/api/src/lib/otp.ts` extracts the OTP core (generate/hash/store/rate-limit/send/
consume) out of `storefront.service.ts` so it's shared, unchanged, by the existing
public phone-OTP-login flow and the new authenticated phone-verification flow. Same
5-minute expiry, 5-attempt limit, 60-second resend cooldown, single-use semantics, and
`SmsProvider` boundary as before this task — nothing about the OTP mechanics changed,
only who's allowed to call it and what happens on success.

## 6. Approval System

`Store.approvalStatus` (`PENDING`/`APPROVED`/`REJECTED`) + `approvedById`/`approvedAt`/
`approvalReason`. `approveStore`/`rejectStoreApproval` (`store.service.ts`) mirror the
existing `suspendStore`/`reactivateStore` pattern and write `STORE_APPROVED`/
`STORE_APPROVAL_REJECTED` audit log entries. Every new trial store starts `PENDING`.
Approval never touches verification fields, and vice versa — see the dedicated test in
§13.

## 7. Domain System

New `DomainRequest` model + `DomainRequestStatus` (`PENDING`/`APPROVED`/`REJECTED`/
`ASSIGNED`), fully separate from the pre-existing `StoreDomain`/`DomainStatus`
self-service custom-domain flow. Merchant checks availability
(server-side-authoritative, checks both `StoreDomain` and active `DomainRequest`
rows plus a reserved-word list), requests a label, and Master Admin approves/assigns
(assign creates a real `StoreDomain` row as `VERIFIED`/`ACTIVE` in a transaction) or
rejects with an optional reason.

## 8. Database Changes

- `User`: + `emailVerified`, `phoneVerified` (booleans, default false); + relations
  `storesApproved`, `domainRequestsReviewed`.
- `Store`: + `approvalStatus` (enum, default `APPROVED` for pre-existing rows), +
  `approvedById`, `approvedAt`, `approvalReason`; + index on `approvalStatus`.
- `Customer`: `phone` changed from required to nullable; + `emailVerified`,
  `phoneVerified`; + `@@unique([storeId, email])` (new — verified zero pre-existing
  duplicates before applying).
- New models: `DomainRequest`, `EmailVerificationToken`.
- New enums: `StoreApprovalStatus`, `DomainRequestStatus`, `EmailVerificationSubject`.
- Migration: `packages/prisma/migrations/20260815180036_add_verification_approval_domain_requests/`.

## 9. API Changes

**Storefront** (`apps/api/src/routes/storefront.routes.ts`): `POST /auth/register`,
`POST /auth/login`, `POST /auth/password/reset-request`, `POST /auth/password/reset-confirm`,
`POST /account/email-verification/send`, `POST /account/email-verification/verify`,
`POST /account/phone-verification/send`, `POST /account/phone-verification/verify`.
Existing `POST /auth/otp/request` / `POST /auth/otp/verify` unchanged.

**Merchant/staff** (`apps/api/src/routes/auth.routes.ts`): `POST /email-verification/send`,
`POST /email-verification/verify`, `POST /phone-verification/send`,
`POST /phone-verification/verify`.

**Admin** (`apps/api/src/routes/admin.routes.ts`): `POST /stores/:id/approve`,
`POST /stores/:id/reject-approval`, `GET /stores?approvalStatus=...` (extended),
`GET /domain-requests`, `POST /domain-requests/:id/approve`,
`POST /domain-requests/:id/reject`, `POST /domain-requests/:id/assign`.

**Store** (`apps/api/src/routes/store.routes.ts`): `GET /domain-requests/check`,
`GET /domain-requests`, `POST /domain-requests` (rate-limited 10/hour).

## 10. Frontend Changes

- **Storefront**: `AuthPage.tsx` rewritten with a password/OTP method toggle
  (password is the default/primary method); new `ResetPasswordPage.tsx`,
  `VerifyEmailPage.tsx`, `VerificationSection.tsx` (embedded in `AccountPage.tsx`).
- **Marketing**: `TrialRequestPage.tsx` gained password/confirm-password fields and a
  post-signup "Go to merchant dashboard" link.
- **Store-dashboard**: new `MerchantVerificationCard.tsx`, `DomainRequestCard.tsx`
  (both on Settings), `VerifyEmailPage.tsx`.
- **Admin-panel**: `StoresPage.tsx` gained an Approval/Verification column with
  Approve/Reject actions; new `DomainRequestsPage.tsx` (list/approve/assign/reject),
  linked from the sidebar.

## 11. Environment Variables

No new variables were introduced. Email verification reuses the existing
`SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM`
(already used for order-status emails); phone verification reuses the existing SMS
provider variables from the Phone OTP feature. Both are optional in development/test
and required in production for their respective verification path to work (fail
closed, not silently faked).

## 12. Security

- Passwords: existing bcrypt hashing path, unchanged.
- Email tokens: 256-bit random (`crypto.randomBytes(32)`), only a SHA-256 lookup hash
  is ever persisted, 24-hour expiry, single-use (`usedAt`), superseded by any newer
  request for the same subject.
- OTP: unchanged existing hashed/expiring/attempt-limited/cooldown-limited storage.
- No token/OTP values are ever logged; dev-mode responses expose them only in
  `NODE_ENV=development|test`.
- No account enumeration: the public customer password-reset-request endpoint always
  returns the same response regardless of whether the email exists. Verification
  send/verify endpoints are authenticated-caller-only, so enumeration doesn't apply.
- Domain availability is always server-side-authoritative
  (`checkDomainLabelAvailability`), backed by real DB uniqueness — the frontend never
  decides "available" on its own.
- Verification and approval are structurally incapable of setting each other (the
  functions that write one never reference the other's fields) — see the dedicated
  test in §13.

## 13. Tests

All commands run from `apps/api` via `npm test` (Vitest), against a real seeded
Postgres dev database. Full suite: **101/101 passing**, 8 files, ~42s.

| Area | Test | Result |
|---|---|---|
| Customer auth | Registers, immediately usable, logs back in — no forced verification | PASS |
| Customer auth | Same email allowed as independent accounts at two different stores | PASS |
| Customer auth | Rejects wrong password | PASS |
| Customer auth | Full HTTP round trip: register → `/me` unverified → login again | PASS |
| Email verification | Merchant (`User`) and customer share the exact same service | PASS |
| Phone verification | Customer verifies a phone without a new session | PASS |
| Phone verification | Rejects claiming a phone another customer at the same store already has | PASS |
| Approval | Master Admin can approve a store whose owner has verified nothing at all | PASS |
| Approval | Approval never flips verification, and vice versa | PASS |
| Domain requests | Full lifecycle: check → request → approve → assign → `StoreDomain` created | PASS |
| Domain requests | Rejects a label already taken / reserved / pending elsewhere | PASS |
| Trial | Public trial request provisions an isolated store with a working URL and login-ready password | PASS |
| Regression | Pre-existing OTP suite (17 tests) unchanged and passing after `lib/otp.ts` extraction | PASS |
| Regression | Pre-existing tenant isolation, RBAC, checkout, theme, pricing suites | PASS (all 101) |

**Live browser verification** (Playwright against the running dev stack, not just
unit tests):

| Flow | Result |
|---|---|
| Storefront register → immediately on `/account`, no forced verification | PASS |
| Full email verification: send → dev link → confirm → account page reflects it | PASS |
| Full phone verification: send → dev OTP → confirm → account page reflects it | PASS |
| Page reload while logged in (storefront) | PASS (after fix — see §14) |
| Page reload while logged in (store-dashboard) | PASS (after fix — see §14) |
| Page reload while logged in (admin-panel) | PASS (after fix — see §14) |
| Trial signup with password via marketing page | PASS |
| Merchant login into store-dashboard with the trial password | PASS |
| Domain request: check availability → request → PENDING | PASS |
| Admin: domain-requests list shows the request → Assign → ASSIGNED, real `StoreDomain` created | PASS |
| Gateway routes an arbitrary `*.commercenest.local` host to the storefront app | PASS |
| Admin-panel Stores page: Approval/Verification column renders, Approve action works, no console errors | PASS |
| Console errors across all flows above | None observed |

## 14. Known Limitations / Findings

**Fixed during this task**: `configureApiAuth()` (wires the API client's token
getters and 401 handler) was called inside a `useEffect` in `AuthBootstrap` in
`apps/storefront/src/App.tsx`, `apps/store-dashboard/src/App.tsx`, and
`apps/admin-panel/src/App.tsx`. Since `useEffect` runs after the first render, any
already-`enabled` query firing on that very first render (e.g. `/me` right after a
page reload, when the persisted token is already available) built its request through
the still-default no-op token getter, silently omitting the `Authorization` header and
triggering a 401 → logout. This is a pre-existing defect, unrelated in origin to this
task's feature work, but it was directly blocking verification of the new
account/verification pages (which need a working page reload to check post-action
state). Fixed by moving `configureApiAuth(...)` to module scope in all three files
(store-dashboard's impersonation-handoff logic was preserved intact). Confirmed fixed
live in all three apps (see table above). `apps/marketing` was not affected — it makes
no authenticated calls.

**Design limitations, by intent** (see `AUTHENTICATION_ARCHITECTURE.md` §7): no
billing/subscription gating tied to approval or verification; no real DNS/registrar
integration for the domain system — "assigning" a domain creates a `StoreDomain` row
the platform's own host-based routing already understands, it does not register
anything externally; approval/verification are additive status fields, not new
authorization gates on any existing route.

## 15. Remaining Manual Configuration

- Set `SMTP_HOST`/`SMTP_PORT`/`SMTP_SECURE`/`SMTP_USER`/`SMTP_PASSWORD`/`SMTP_FROM` in
  production for real email-verification delivery (already required for order
  emails — no new variable to provision).
- Confirm the SMS provider credentials used for Phone OTP (from the earlier OTP task)
  are set in production — phone verification depends on the same provider.
- If real `*.commercenest.<tld>` addresses should resolve outside this dev
  environment, wildcard DNS for that domain needs to point at the production
  edge/gateway — this build only handles the CommerceNest-side record
  (`StoreDomain`) and the gateway's own host-based routing, not registrar-level DNS.

## 16. Exact Next Steps

- Nothing is blocking; the system is feature-complete per the specification and fully
  tested. Natural follow-ups (not requested, not built): a "resend verification"
  reminder banner surfaced elsewhere in the merchant/customer UI; bulk domain-request
  review actions for Master Admin if request volume grows; code-splitting the
  admin-panel bundle (pre-existing >500kB chunk warning, unrelated to this task).
