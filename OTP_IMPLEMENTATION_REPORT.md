# CommerceNest — OTP Authentication Implementation Report

## 1. Executive Summary

**OTP was already ~70% implemented, but had one critical gap: it never actually sent an SMS.**

The routes, rate limiting, JWT issuance, tenant resolution, and frontend UI all already existed and worked correctly. What was missing was the one thing that makes OTP actually usable by a real customer: `requestOtp()` generated a 6-digit code, stored it, and returned `{ok:true}` — but no code anywhere called an SMS provider. In production, a customer could request an OTP, receive a success response, and have no possible way to ever see the code. The project's own `.env.example` already carried an honest comment admitting this: *"SMS provider (optional — without this, production OTP cannot be delivered)."*

**What I changed:**
1. Built a real `SmsProvider` boundary (`apps/api/src/lib/sms.ts`) with a `local-stub` (dev/test) and a real `twilio` adapter, wired `requestOtp` to actually call it.
2. Made production refuse to silently use the stub — a missing SMS provider now fails the request with a clear `503 SMS_UNAVAILABLE` instead of pretending to succeed.
3. Closed four smaller security gaps: OTP codes are now bcrypt-hashed at rest (were plaintext), a 60-second resend cooldown is enforced server-side, a 5-attempt limit invalidates a code before it can be brute-forced, and expiry is now an explicit, correctly-enforced 5 minutes instead of relying only on Redis's own TTL.
4. Added resend-with-countdown, a "change phone number" link, and more specific error messages to the existing frontend UI.

**Is it development-ready?** Yes — fully working today, verified live in a real browser end to end (send → devCode → verify → redirected into the authenticated account experience), plus 17 new automated tests.

**Is it production-ready?** Architecturally yes. Functionally, **no — because there are no real SMS provider credentials in this environment**, and I have no way to obtain or test against one. The code path for a real provider (Twilio) is fully implemented and was code-reviewed against Twilio's actual REST API contract, but it has never been exercised against a live account, because none exists here. This is exactly the "implemented but credentials remain" case (option **B** from the task's own classification) — see §14.

---

## 2. Initial State

```
Frontend OTP UI:         Present (apps/storefront/src/pages/AuthPage.tsx)
Send OTP API:            Present (POST /auth/otp/request)
Verify OTP API:          Present (POST /auth/otp/verify)
OTP generation:          Present (6-digit random code)
OTP → SMS delivery:      MISSING — no code path sent the SMS anywhere
SMS provider abstraction: Absent (SMS_PROVIDER env var existed but nothing read it in the OTP path)
Real SMS provider:       Missing (no credentials, no adapter existed)
Local stub:              Partial — devCode was returned in the API response in dev, but no analogous stub existed as an
                          actual "provider" concept; nothing would have happened at all in production
Rate limiting:            Present (per-IP and per-phone, both request and verify)
OTP expiration:          Present but soft — a 10-minute Redis TTL only, no explicit/authoritative expiry check
OTP hashing:              Absent — codes were stored as plaintext strings in Redis/kv
Attempt limiting:         Absent — only the generic rate limiter existed, not a per-code attempt budget
Resend cooldown:          Absent — nothing prevented immediate repeated requests beyond the blunt 10/min IP limit
Multi-tenant scoping:     Present and correct — kv keys and Customer records were already store-scoped
JWT/session issuance:     Present and reused as-is (signCustomerToken, 2h TTL, unchanged)
```

Customer auth in this codebase is **OTP-only by design** (`DECISIONS.md`: *"Customer auth | Phone OTP (not email/password)"*). Password-based customer schemas exist in `packages/types/src/schemas/auth.ts` (`customerLoginSchema`, `customerRegisterSchema`, etc.) but are dead code — grepped for usage across `apps/api` and `apps/storefront` and found zero call sites. They were left untouched; removing dead code was out of scope for this task.

---

## 3. Files Inspected

- `apps/api/src/routes/storefront.routes.ts` — OTP route definitions, rate-limit configuration
- `apps/api/src/services/storefront.service.ts` — `requestOtp`/`verifyOtp` business logic, `resolveStoreBySlug`, `publicCustomer`
- `apps/api/src/lib/redis.ts` — the `kvGet`/`kvSet`/`kvDel`/`kvIncr` abstraction (Redis with in-memory fallback), used for OTP storage
- `apps/api/src/lib/env.ts` — environment schema/validation, existing `hasCloudinary`/`hasSmtp` production-readiness patterns
- `apps/api/src/lib/email.ts` — the closest existing analog to what an SMS provider boundary should look like (generic SMTP, stub fallback, non-throwing)
- `apps/api/src/events/subscribers.ts` — `logSmsLocally`, a **separate, unrelated** SMS use case (order-lifecycle notifications), explicitly documented as intentionally postponed for V1 — confirmed this does NOT cover OTP delivery
- `apps/api/src/lib/jwt.ts` — `signCustomerToken`, customer JWT shape (`sub`, `storeId`, `typ: 'customer'`)
- `apps/api/src/middleware/auth.ts` — `requireCustomer`, tenant-scoped customer loading
- `apps/api/src/middleware/rateLimit.ts` — the rate-limit middleware factory
- `apps/api/src/lib/errors.ts` — `AppError` static factory pattern
- `apps/api/src/lib/password.ts` — **existing** `hashToken`/`verifyTokenHash` (bcrypt), reused for OTP hashing rather than inventing new crypto
- `packages/types/src/api.ts` — `ApiErrorCode` enum
- `packages/types/src/schemas/auth.ts` — `bangladeshPhoneSchema`, confirmed dead password-auth schemas
- `packages/types/src/enums.ts` — `BANGLADESH_PHONE_REGEX = /^01[3-9]\d{8}\$/` (local format only — no `+880` anywhere in the existing data model)
- `packages/prisma/schema.prisma` — `Customer` model, `@@unique([storeId, phone])` (confirms per-tenant phone scoping)
- `apps/storefront/src/pages/AuthPage.tsx` — the existing OTP UI (login/register/forgot all route to the same component)
- `apps/storefront/src/lib/api.ts` — `otpRequest`/`otpVerify` client methods, `ApiClientError`
- `apps/storefront/src/stores/authStore.ts` — customer session storage (Zustand + persist)
- `.env.example`, `apps/api/.env.example`, `apps/storefront/.env.example`, `apps/admin-panel/.env.example`, `apps/store-dashboard/.env.example`
- `SECURITY.md`, `DECISIONS.md`, `PRODUCTION_READINESS_REPORT.md` — existing documented decisions about SMS/OTP
- `apps/api/src/app.test.ts`, `apps/api/src/integration.flows.test.ts`, `apps/api/src/test/setup.ts` — existing test conventions (supertest, `hasDatabase` gating, seeded store slugs)

---

## 4. Files Modified

**`packages/types/src/api.ts`**
Purpose: shared API error-code enum.
Change: added `SMS_UNAVAILABLE` to `ApiErrorCode`.
Why: a distinct, typed code the frontend can branch on for the new "SMS delivery unavailable" case, consistent with every other error case in the enum.

**`apps/api/src/lib/errors.ts`**
Purpose: `AppError` factory.
Change: added `AppError.serviceUnavailable(message, code?)` → HTTP 503.
Why: no 503 helper existed; needed for the "SMS provider unconfigured/failed" response, matching the existing static-factory pattern (`badRequest`, `unauthorized`, etc.).

**`apps/api/src/lib/env.ts`**
Purpose: environment schema and production-readiness checks.
Change: added `SMS_PROVIDER_API_SECRET` and `SMS_PROVIDER_SENDER_ID` to the schema (alongside the pre-existing `SMS_PROVIDER`/`SMS_PROVIDER_API_KEY`, which was in `.env.example` but had never actually been added to the validated schema); added an exported `hasSmsProvider` boolean; added a production-boot `console.error` when no real provider is configured.
Why: `SMS_PROVIDER_API_KEY` existed in `.env.example` but wasn't in the Zod schema at all, so no code could read it type-safely. The new vars are what a real adapter (Twilio) needs. The production check mirrors the existing `hasCloudinary`/`hasSmtp` pattern, but is a `console.error` (not `console.warn`) — deliberately louder, because unlike SMTP this is a hard functional break (OTP is the *only* customer login mechanism), not a degraded nice-to-have.

**`apps/api/src/services/storefront.service.ts`**
Purpose: `requestOtp`/`verifyOtp` business logic.
Change: rewrote both functions. `requestOtp` now checks a 60s resend cooldown, hashes the code with bcrypt before storing, stores an explicit `expiresAt`, calls the new `sendSms()`, and converts SMS failures into a 503 instead of returning a false "OTP sent". `verifyOtp` now enforces the 5-attempt limit and the explicit expiry, and does a bcrypt comparison instead of a plaintext string comparison.
Why: this is the core of the task — closing the "never actually sends" gap and the storage/attempts/cooldown gaps, while leaving customer lookup/creation and JWT issuance completely untouched (same `signCustomerToken`, same `publicCustomer`, same auto-create-on-first-login behavior).

**`.env.example`** (root) and **`apps/api/.env.example`**
Purpose: environment variable documentation.
Change: documented the two new SMS vars, clarified what `SMS_PROVIDER=twilio` expects, updated the comment to reflect the new fail-closed production behavior.
Why: the task explicitly requires documenting new required vars without inventing fake values.

**`SECURITY.md`**
Purpose: security documentation.
Change: rewrote the "OTP (storefront customers)" section to state the actual implemented values (5-minute expiry, bcrypt hashing, 5 attempts, 60s cooldown, single-use, SMS provider boundary); corrected a stale "10-minute TTL" reference in the Redis section to 5 minutes.
Why: docs must match code; the previous section described the pre-fix state.

**`apps/storefront/src/pages/AuthPage.tsx`**
Purpose: the existing OTP login/register/forgot UI (all three modes share this one component).
Change: added a resend button with a live 60-second countdown (mirroring the new server-side cooldown), a "change phone number" link to back out of the OTP step, `inputMode`/`maxLength` on the code field, a disabled state on Send/Verify until the input is well-formed, and a `describeAuthError` helper that prefers the specific Zod field message (e.g. "Phone must be a valid Bangladesh mobile number") over the generic "Validation failed" when available.
Why: closes the explicit UX gaps the task called out (no resend button existed at all before), without redesigning the component or touching the shared API client.

---

## 5. Files Created

**`apps/api/src/lib/sms.ts`**
The `SmsProvider` boundary. Exports `sendSms()`, the pure/testable `resolveSmsMode()` decision function, `toE164Bangladesh()` (local → international conversion, used only at the provider boundary), a `local-stub` implementation (logs + captures the message for dev/test visibility), and a real `twilio` adapter built against Twilio's actual REST API (Basic Auth with Account SID/Auth Token, `POST /2010-04-01/Accounts/{sid}/Messages.json`, form-encoded body). Two typed errors (`SmsDeliveryError`, `SmsProviderUnconfiguredError`) let callers distinguish "tried and failed" from "refused to try in production."
Why new: no SMS-sending abstraction existed anywhere in the codebase — `logSmsLocally` (in `events/subscribers.ts`) is a single hardcoded log statement for an unrelated feature (order notifications), not a swappable provider boundary, and it isn't reused here (see §18 — Known Limitations for why).

**`apps/api/src/storefront-otp.test.ts`**
17 tests: 6 pure unit tests for `resolveSmsMode`/`toE164Bangladesh` (no DB/network), 9 service-level tests (`requestOtp`/`verifyOtp` called directly, bypassing HTTP so they don't compete for the same rate-limit budget), 2 HTTP-level tests via `supertest` (end-to-end wiring through the real Express app, and the rate limiter itself).
Why new: zero existing test coverage for OTP.

**`OTP_IMPLEMENTATION_REPORT.md`** — this file.

---

## 6. API Changes

**No new endpoints or request/response shapes were added.** Both endpoints already existed with the same contract; only their internal behavior changed.

### `POST /api/storefront/:storeSlug/auth/otp/request`
- Request: `{ "phone": "01XXXXXXXXX" }`
- Response (200): `{ "ok": true, "message": "OTP sent", "devCode"?: "123456" }` — `devCode` present only when `NODE_ENV` is `development` or `test`
- Errors:
  - `400 VALIDATION_ERROR` — malformed phone (Zod, `bangladeshPhoneSchema`)
  - `429 RATE_LIMITED` — either the 60s per-phone resend cooldown (new) or the pre-existing 10/min-per-IP limiter
  - `503 SMS_UNAVAILABLE` (new) — no real SMS provider configured in production, or the provider call itself failed
  - `404 NOT_FOUND` — unknown/archived/suspended store slug
- Auth: none (pre-auth by definition)
- Tenant context: store resolved from the `:storeSlug` path param

### `POST /api/storefront/:storeSlug/auth/otp/verify`
- Request: `{ "phone": "01XXXXXXXXX", "code": "123456" }`
- Response (200): `{ "accessToken": "...", "customer": { "id", "storeId", "phone", "name", "email", ... } }`
- Errors:
  - `400 VALIDATION_ERROR` — malformed phone/code
  - `401 UNAUTHORIZED` — wrong code, expired code, no code was ever requested, or the attempt budget is exhausted (`"Too many incorrect attempts. Please request a new code."` — the one case given a distinct message, since it doesn't help an attacker guess the code, only tells them the attempt is over)
  - `429 RATE_LIMITED` — 20/min/IP or 8/10min/phone (both pre-existing, unchanged)
  - `404 NOT_FOUND` — unknown store slug
- Auth: none
- Tenant context: same as above; a code requested for Store A cannot verify against Store B even with an identical phone number (independent kv namespaces, independent `Customer` rows)

---

## 7. Environment Variables

| Variable | Belongs in | Dev required? | Prod required? | Meaning |
|---|---|---|---|---|
| `SMS_PROVIDER` | root `.env` (loaded by `apps/api`) | No | **Yes** | `twilio` to enable real delivery; empty uses the local stub |
| `SMS_PROVIDER_API_KEY` | root `.env` | No | **Yes**, if `SMS_PROVIDER=twilio` | Twilio Account SID |
| `SMS_PROVIDER_API_SECRET` | root `.env` (**new**) | No | **Yes**, if `SMS_PROVIDER=twilio` | Twilio Auth Token |
| `SMS_PROVIDER_SENDER_ID` | root `.env` (**new**) | No | **Yes**, if `SMS_PROVIDER=twilio` | Twilio "From" number, e.g. `+15005550006` |

Configured in this environment: **no** (all four empty — confirmed programmatically without printing values). This is expected; I have no provider account to configure. Development and the full test suite both work correctly without them, via the local stub.

These must **never** be added to any `VITE_*` / frontend `.env.example` — confirmed all four frontend apps' env files remain untouched and contain no SMS variables. The browser only ever talks to the CommerceNest API; the API is the only thing that talks to Twilio.

---

## 8. SMS Provider

```
Provider:            Twilio (chosen because it has a well-documented, precisely-specifiable REST API and
                      genuinely supports sending to Bangladesh numbers — I did not have credentials to test
                      against, so I deliberately picked a provider I could implement *correctly* from public
                      documentation rather than guess at, over a Bangladesh-local gateway with a less
                      standardized/undocumented API I could not verify)
Integration method:  Direct REST call via the platform's native fetch() — Basic Auth (Account SID : Auth
                      Token), POST to /2010-04-01/Accounts/{sid}/Messages.json, form-encoded To/From/Body
API used:             Twilio Programmable Messaging API
Development behavior: local-stub — the code is generated, hashed, stored, and logged server-side
                      (never over the network); the plaintext code is additionally returned as `devCode` in
                      the API response, exactly as before
Production behavior:  if SMS_PROVIDER=twilio and all three credentials are set, a real HTTP call is made and
                      the request only succeeds if Twilio actually accepts the message; if not fully
                      configured, requestOtp() is refused outright with 503 SMS_UNAVAILABLE — it does NOT
                      fall back to the stub or fake success
```

**This has never been tested against a live Twilio account** — none exists in this environment. The adapter was written directly against Twilio's public API reference and code-reviewed for correctness (auth header construction, endpoint URL, required fields, error-body handling), but "written correctly against the docs" and "verified against a real send" are different claims, and I'm not conflating them. See §14 for exactly what's needed to close this gap.

---

## 9. OTP Security

```
OTP expiration:       5 minutes, enforced via an explicit `expiresAt` timestamp stored alongside the code
                       (not just Redis's own TTL — see the "why" in the code comment in storefront.service.ts;
                       a failed-attempt re-write would otherwise reset a plain TTL back to the full window)
Maximum attempts:      5 incorrect guesses invalidate the code immediately
Resend cooldown:       60 seconds per phone number, server-enforced (rl: kv key), independent of the broader
                       per-IP/per-phone rate limits
Rate limiting:         unchanged, pre-existing — 10/min/IP on request, 20/min/IP + 8/10min/phone on verify
Storage:               bcrypt hash (cost 10, via the existing lib/password.ts#hashToken/verifyTokenHash —
                       reused, not reinvented), in Redis/kv, never plaintext
Replay protection:     the stored entry is deleted immediately on successful verification — replaying the
                       same correct code a second time fails exactly like an expired one
Logging protection:    the raw code is never logged in the real-provider path. It IS logged in the
                       local-stub path (dev/test only, by design — this is the developer-visibility
                       mechanism, equivalent to the pre-existing `devCode` API field) and is never reachable
                       in that form in production, since the stub path itself is refused in production
                       (see §8). JWT/SMS-provider secrets are never logged anywhere.
```

---

## 10. Multi-Tenant Behavior

Unchanged from the existing (already-correct) architecture — I verified it, did not need to build it:

- Every OTP kv key is namespaced `otp:{storeSlug}:{phone}` (and `otp:cooldown:{storeSlug}:{phone}`) — a code requested for `techworld-bd` simply does not exist in `rahim-mobile`'s namespace.
- `Customer` records are scoped `@@unique([storeId, phone])` in Postgres — the same phone number produces two entirely independent customer rows at two different stores, each with its own ID, order history, and risk profile.
- The issued JWT embeds `storeId` directly in its signed claims (`signCustomerToken`), and every subsequent authenticated request (`requireCustomer` middleware, and the `/me` route's own explicit double-check) verifies that claim against the store resolved from the current request's slug — a token minted for Store A's customer is structurally incapable of authenticating as a Store B customer.
- **Verified live**, not just asserted: the same phone number was walked through the real browser UI at both `techworld-bd.localhost` and `rahim-mobile.localhost`, landing on two different account pages with two different store headers, and I confirmed via a direct database query that two separate `Customer` rows (different IDs) were created — see §13.

---

## 11. Frontend Changes

All in `apps/storefront/src/pages/AuthPage.tsx` (the single component behind `/login`, `/register`, and `/forgot` — these were already, and remain, three routes into one OTP flow, not three separate systems):

- **Phone input**: unchanged position/label; now `type="tel"` with `inputMode="tel"`; Send OTP is disabled until non-empty.
- **Send OTP**: unchanged call, now starts a 60s cooldown on success.
- **OTP input**: now numeric-only (`inputMode="numeric"`), capped at 6 digits, auto-focused when the step appears; Verify is disabled until exactly 6 digits are entered.
- **Verify OTP**: unchanged call/redirect-to-`/account` behavior on success.
- **Resend** (new): a "Resend OTP in Ns" button, disabled during the countdown, calling the same `requestOtp` path. If the server rejects a send because a cooldown is already active (e.g. after a page reload), the UI countdown is restarted from the server's own rejection rather than silently staying wrong.
- **Change phone number** (new): a link back to the phone-entry step, clearing the code/error/cooldown state.
- **Loading state**: pre-existing `Button loading` prop, unchanged.
- **Error state**: pre-existing `Alert tone="danger"`, now shows the specific Zod field message for validation errors (e.g. the exact phone-format rule) instead of the generic "Validation failed", while every other error (wrong code, expired, too many attempts, rate limited, SMS unavailable) surfaces the same customer-safe message the backend returns — no internal details leak through.
- **Success behavior**: unchanged — immediate `navigate('/account')` on a verified session.
- **Dev OTP visibility**: unchanged (`import.meta.env.DEV` gate), still shows the code inline for local testing.

---

## 12. Database Changes

**No database changes were required or made.** OTP codes remain in Redis/kv (ephemeral, short-lived by nature — a real database table with 5-minute-lived rows would only add migration/cleanup overhead for no benefit). No `packages/prisma/schema.prisma` changes, no new migrations. The existing `Customer` model and its `@@unique([storeId, phone])` constraint were already correct and are unchanged.

---

## 13. Testing Performed

| Test | Result | Notes |
|---|---|---|
| Valid phone | PASS | Automated (`storefront-otp.test.ts`) + live browser |
| Send OTP | PASS | Automated + live browser; confirmed the local-stub actually "sends" (captured message contains the exact code) |
| Correct OTP | PASS | Automated + live browser, redirected into `/account` with zero console errors |
| Wrong OTP | PASS | Automated + live browser — shows "Invalid or expired OTP", stays on the OTP step |
| Expired OTP | PASS | Automated only — forced via direct kv manipulation of `expiresAt` (not a real 5-minute wait); confirmed rejected |
| OTP reuse | PASS | Automated — verifying the same correct code twice fails the second time |
| Attempt limit (5 wrong → locked) | PASS | Automated + live browser — 4× generic error, 5th shows "Too many incorrect attempts. Please request a new code.", and a subsequent *correct* code is then also rejected |
| Resend cooldown | PASS | Automated + live browser — UI shows a live "Resend OTP in Ns" countdown, disabled until it reaches 0; server independently enforces the same 60s |
| Rate limiting | PASS | Automated — looped `/auth/otp/request` until a real `429 RATE_LIMITED` was returned by the actual Express app |
| Multi-tenant | PASS | Automated (service-level, two seeded stores) + live browser (same phone at `techworld-bd` and `rahim-mobile`, two separate account pages, confirmed via direct DB query that two distinct `Customer` rows were created) |
| Provider unavailable (SMS send failure) | PASS | Automated — `SmsDeliveryError`/`SmsProviderUnconfiguredError` paths are typed and wired to a 503; the Twilio HTTP-failure branch was code-reviewed, not exercised against a real failing account (none exists) |
| Missing production configuration | PASS | Automated, at the decision-logic level — `resolveSmsMode({nodeEnv:'production', providerConfigured:false})` returns `'unconfigured-production'`, which `sendSms()`'s three-line dispatch throws on. **Not** run as a live end-to-end production-mode HTTP request in this same process (that would require mutating global `NODE_ENV` in a running test process, which isn't a safe or meaningful test) — the pure-function test is the correct level to verify this exact logic, and it's the same function the runtime path calls |
| Build | PASS | `npm run build` — all 7 workspaces (`types`, `prisma`, `api`, `admin-panel`, `store-dashboard`, `storefront`, `marketing`) build clean |
| Lint | N/A | No workspace in this repo defines a `lint` script (pre-existing, confirmed — not something this task introduced or should invent) |
| Tests | PASS | Full suite: 78/78 (`apps/api`), including all 17 new OTP tests — zero regressions in the other 61 pre-existing tests |

**Not tested (and said so plainly, not implied otherwise):** an actual SMS arriving on a real Bangladeshi phone. That requires a funded Twilio (or equivalent) account, which does not exist in this environment.

---

## 14. Remaining Configuration

Only what's actually necessary:

1. Create a Twilio account (or swap in a different provider — see §15).
2. Buy/verify a sender number capable of sending to Bangladesh, or complete Twilio's alphanumeric-sender-ID registration if that's preferred for BD delivery.
3. Set the four production environment variables (`SMS_PROVIDER=twilio`, `SMS_PROVIDER_API_KEY`, `SMS_PROVIDER_API_SECRET`, `SMS_PROVIDER_SENDER_ID`) in the real production environment (not `.env.example`, not committed anywhere).
4. Restart the API so `apps/api/src/lib/env.ts` picks up the new values.
5. Send one real test OTP to a real Bangladeshi number and confirm delivery/timing before relying on it for actual customers.
6. Set `REDIS_URL` before running more than one API instance (pre-existing requirement, unrelated to this task, but directly relevant to OTP specifically — see `SECURITY.md`'s Redis section: without it, a customer's request and verify can land on different instances and the code "disappears").

---

## 15. Known Limitations

- **No real SMS has ever been sent or received.** Everything up to the Twilio HTTP call has been verified for real; the call itself has not, because no account exists here.
- **Twilio is the only real adapter implemented.** If the actual production choice is a Bangladesh-local gateway instead (often cheaper for BD-only traffic), a second branch needs to be added inside `lib/sms.ts`'s `sendSms()` — the boundary is designed for exactly this, but I did not implement a second provider speculatively, since I had no specific gateway's API contract to implement correctly against.
- **`logSmsLocally` (order-lifecycle SMS notifications — payment approved/rejected, order shipped/delivered, refund completed) was intentionally left untouched.** It's a separate, unrelated feature (explicitly documented in `PRODUCTION_READINESS_REPORT.md` as a deliberately-postponed decision), and the task's own rules said not to touch unrelated features. It would be a natural, low-risk follow-up to route it through the new `sendSms()` boundary instead of its current hardcoded log-only function, but that's a decision for whoever owns that notification feature, not something I did unilaterally here.
- **The generic per-IP rate limiter is still a blunt instrument.** A determined attacker rotating IPs is still bounded by the per-phone limiter (8 verify attempts/10min) and the new 5-attempt code-invalidation, but there's no device-fingerprint or CAPTCHA-style defense beyond that. This matches the codebase's existing rate-limiting posture everywhere else (login, checkout, etc.) — not a gap specific to OTP.
- **Twilio-specific regulatory details for Bangladesh** (DLT/sender-ID registration requirements, if any apply to the chosen number type) are outside what I can verify without an account — flagging this explicitly rather than guessing.

---

## 16. Exact Next Steps

```
1. Decide on an SMS provider: Twilio (already implemented) or a Bangladesh-local
   gateway (would need a second adapter added to lib/sms.ts).
2. Create the account and obtain: API key/SID, API secret/auth token, sender ID/number.
3. Add to the REAL production environment (not .env.example):
     SMS_PROVIDER=twilio
     SMS_PROVIDER_API_KEY=<your Account SID>
     SMS_PROVIDER_API_SECRET=<your Auth Token>
     SMS_PROVIDER_SENDER_ID=<your From number>
4. Restart the API process.
5. Confirm the server no longer logs the "PRODUCTION MISCONFIGURATION: No real SMS
   provider is configured" message at boot.
6. Open the storefront, go to /login for any store.
7. Enter a real Bangladeshi phone number, click Send OTP.
8. Confirm a real SMS actually arrives on that phone within a few seconds.
9. Enter the received code, click Verify & continue.
10. Confirm you land on /account, authenticated as that phone's customer.
11. Set REDIS_URL if running more than one API instance.
```
