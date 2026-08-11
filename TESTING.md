# CommerceNest Testing

Testing strategy for CommerceNest V1 using **Vitest**.

## Test runner

| Workspace | Framework | Command |
|-----------|-----------|---------|
| `@commercenest/api` | Vitest 3 + Supertest | `npm run test -w @commercenest/api` |
| Root (all workspaces) | — | `npm run test` |

API scripts:

```bash
npm run test -w @commercenest/api          # single run
npm run test:watch -w @commercenest/api    # watch mode
```

---

## Test files

Located in `apps/api/src/`:

| File | Type | Coverage |
|------|------|----------|
| `app.test.ts` | Integration | Health, login validation, auth guards, **tenant isolation** |
| `services/customer-risk.service.test.ts` | Unit | Risk level calculation (Part 10.2 rules) |
| `services/order-state-machine.test.ts` | Unit | Valid/invalid order status transitions |

Setup: `apps/api/src/test/setup.ts` — sets `hasDatabase` flag from `DATABASE_URL`.

---

## Tenant isolation requirement

**Mandatory integration test:** a store owner token for Store A must **not** access Store B resources.

Implemented in `app.test.ts`:

```
Store A owner login → token A, storeAId
Store B owner login → storeBId
GET /api/store/{storeBId}/products with token A
→ 403 TENANT_MISMATCH
```

This test **skips** when `DATABASE_URL` is unset (CI without Postgres). It **must pass** in any environment with seeded data before release.

Run with database:

```bash
# Start Postgres
docker compose -f docker-compose.dev.yml up -d

# Set DATABASE_URL in .env, migrate + seed
npm run db:push
npm run db:seed

# Run tests
npm run test -w @commercenest/api
```

Expected: 13 tests, 11 passed, 2 skipped (without DB) or **13 passed** (with DB).

---

## Unit test highlights

### Customer risk (`customer-risk.service.test.ts`)

- `NONE` when `refusedOrders < 2`
- `CAUTION` at exactly 2 refused with rate ≤ 40%
- `HIGH_RISK` when refused ≥ 2 AND rate > 40%
- Counter updates on `DELIVERED` / `RETURNED`

### Order state machine (`order-state-machine.test.ts`)

- Valid transitions (PENDING → CONFIRMED → …)
- Invalid transitions rejected
- Cancellation rules

---

## Latest test results

```
Test Files  3 passed (3)
Tests       11 passed | 2 skipped (13)
Duration    ~2s
```

Run date: development session. Skipped tests require Postgres + seed.

To verify locally with full coverage:

```bash
npm run test -w @commercenest/api
```

---

## Coverage goals

| Area | V1 target | Status |
|------|-----------|--------|
| Tenant isolation | 100% — must have integration test | ✅ Implemented (DB-gated) |
| Customer risk rules | 100% unit coverage | ✅ 4 tests |
| Order state machine | Core transitions | ✅ 4 tests |
| Payment approve/reject | Integration | ⬜ Not yet |
| Auth refresh rotation | Integration | ⬜ Not yet |
| Theme publish | Integration | ⬜ Not yet |
| Frontend components | — | ⬜ No vitest in frontends yet |

**V1 minimum bar:** all existing tests pass; tenant isolation test passes with seeded DB.

**V1.1 targets:**

- Payment flow integration test (submit → approve)
- Refresh token revocation test
- Cross-tenant write attempt (POST product to wrong storeId)
- 70%+ line coverage on `services/`

---

## CI recommendation

```yaml
services:
  postgres:
    image: postgres:16-alpine
    env:
      POSTGRES_DB: commercenest
      POSTGRES_USER: commercenest
      POSTGRES_PASSWORD: commercenest
  redis:
    image: redis:7-alpine

steps:
  - npm ci
  - npm run db:generate
  - DATABASE_URL=postgresql://... npm run db:push
  - npm run db:seed
  - npm run test -w @commercenest/api
  - npm run build -w @commercenest/api
```

---

## Manual QA checklist

Beyond automated tests:

- [ ] Master Admin login
- [ ] Store owner login → correct storeId in JWT
- [ ] Pending bKash queue shows seeded order
- [ ] Approve bKash → paymentStatus APPROVED
- [ ] Storefront checkout COD + bKash
- [ ] Impersonation banner visible
- [ ] OTP returns devCode in development only
- [ ] Health endpoint shows database up

---

## Writing new tests

Place tests adjacent to source (`*.test.ts`). Use Vitest `describe` / `it` / `expect`.

For DB tests:

```typescript
import { hasDatabase } from '../test/setup.js';

it.skipIf(!hasDatabase)('needs postgres', async () => {
  // ...
});
```

Never mock away tenant isolation — test the real middleware path with Supertest.
