# CommerceNest

CommerceNest is a multi-tenant e-commerce SaaS platform for Bangladesh-focused online stores. Each merchant gets an isolated store with catalog, orders, manual bKash payments, COD, themed storefronts, and staff dashboards — all managed from a central Master Admin panel.

## Prerequisites

- **Node.js** ≥ 20
- **npm** (workspaces)
- **Docker** (recommended for Postgres + Redis locally)
- **Git**

## Quick start

### 1. Clone and install

```bash
git clone <repo-url> commercenest
cd commercenest
npm install
```

### 2. Environment

```bash
cp .env.example .env
```

Edit `.env` with your local values. See [ENVIRONMENT.md](./ENVIRONMENT.md) for every variable.

**Important:** The API reads `PLATFORM_DOMAIN` and `CORS_ORIGINS` at runtime. If you only set `APP_BASE_DOMAIN` / `CORS_ORIGIN` from the template, also add:

```env
PLATFORM_DOMAIN=commercenest.local
CORS_ORIGINS=http://localhost:5173,http://localhost:5174,http://localhost:5175
```

### 3. Start Postgres and Redis

```bash
docker compose -f docker-compose.dev.yml up -d
```

This starts Postgres on `5432` and Redis on `6379` with default credentials matching `.env.example`.

### 4. Database setup

```bash
npm run db:generate
npm run db:migrate       # applies the committed migration history (packages/prisma/migrations/)
npm run db:seed
```

`db:migrate` runs `prisma migrate dev`, which applies any migrations not yet on your local database and prompts to create a new one if your schema edits aren't captured yet. Use `npm run db:push` only for quick, throwaway schema experiments you don't intend to commit — it never touches `packages/prisma/migrations/` and must not be used against staging/production (see [DATABASE.md](./DATABASE.md#migrations)).

### 5. Run locally

**All workspaces (API + frontends + marketing + gateway):**

```bash
npm run dev
```

Open the single public edge: **http://localhost:8080**

| Surface | Public URL |
|---------|------------|
| Marketing homepage | http://localhost:8080 |
| Master Admin | http://admin.localhost:8080 |
| Store Admin | http://app.localhost:8080 |
| Storefront | http://techworld-bd.localhost:8080 |

Internal Vite/API ports stay behind the gateway. Verify the API via `GET http://localhost:8080/api/health` (or `:4000` internally).

### 6. Seed credentials

| Role | Email | Password |
|------|-------|----------|
| Master Admin | `admin@commercenest.com` | `Admin123!` |
| TechWorld BD owner | `owner@techworld.bd` | `Owner123!` |
| Rahim Mobile owner | `owner@rahimmobile.bd` | `Owner123!` |
| Urban Threads owner | `owner@urbanthreads.bd` | `Owner123!` |

**Demo stores** (seed slugs for API / storefront):

| Store | Slug | Subdomain (local) |
|-------|------|-------------------|
| TechWorld BD | `techworld-bd` | `techworld-bd.commercenest.local` |
| Rahim Mobile | `rahim-mobile` | `rahim-mobile.commercenest.local` |
| Urban Threads | `urban-threads` | `urban-threads.commercenest.local` |

The storefront dev app uses `VITE_STORE_SLUG` (default from env) to pick which store to render. Point it at `techworld-bd` for the richest demo data (pending bKash order, COD order, risk-tier customers).

## Monorepo layout

```
commercenest/
├── apps/
│   ├── api/                 # Express REST API (port 4000)
│   ├── admin-panel/         # Master Admin UI (5173)
│   ├── store-dashboard/     # Store staff UI (5174)
│   ├── storefront/          # Customer-facing shop (5175)
│   └── marketing/           # Public CommerceNest homepage (5176)
├── packages/
│   ├── prisma/              # PostgreSQL schema + generated client
│   ├── types/               # Shared enums, Zod schemas, domain events
│   └── ui/                  # Shared React component library
├── docker-compose.yml       # Full production-like stack
├── docker-compose.dev.yml     # Postgres + Redis only
└── docs (this tree)
    ├── ARCHITECTURE.md
    ├── ENVIRONMENT.md
    ├── DATABASE.md
    ├── API.md
    ├── SECURITY.md
    ├── DEPLOYMENT.md
    ├── DECISIONS.md
    ├── TESTING.md
    └── OVERNIGHT_IMPLEMENTATION_REPORT.md
```

## Architecture overview

```
┌─────────────────┐  ┌──────────────────┐  ┌─────────────────┐
│  admin-panel    │  │ store-dashboard  │  │   storefront    │
│  Master Admin   │  │  Store staff     │  │   Customers     │
└────────┬────────┘  └────────┬─────────┘  └────────┬────────┘
         │                    │                       │
         └────────────────────┼───────────────────────┘
                              │ HTTPS / JSON
                              ▼
                    ┌─────────────────┐
                    │   apps/api      │
                    │  /api/auth      │
                    │  /api/admin     │
                    │  /api/store/:id │
                    │  /api/storefront/:slug
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
         PostgreSQL        Redis         Cloudinary
      (tenant data)   (refresh tokens,   (optional media)
                       rate limits, OTP)
```

- **Multi-tenancy:** Every business row is scoped by `storeId`. Store staff JWTs carry the authoritative `storeId`; path `:storeId` must match.
- **Storefront routing:** Public API resolves stores by `slug` (`/api/storefront/:storeSlug/...`). Production URLs use subdomains (`{slug}.commercenest.com`).
- **Payments V1:** Manual bKash (primary) + Cash on Delivery. Automated gateway enum exists but is not wired.
- **Themes:** Draft/publish/versioning owned by Master Admin in V1; store dashboard is read-only.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detail.

## Common scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Build types → prisma generate → api → all frontends |
| `npm run typecheck` | TypeScript check all workspaces |
| `npm run test` | Run vitest in all workspaces |
| `npm run db:generate` | Regenerate Prisma client |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run db:seed` | Seed demo data |

## Documentation index

| Doc | Contents |
|-----|----------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Apps, packages, tenancy, auth, events, themes |
| [ENVIRONMENT.md](./ENVIRONMENT.md) | All environment variables |
| [DATABASE.md](./DATABASE.md) | Models, indexes, enums, risk rules |
| [API.md](./API.md) | Route groups and key endpoints |
| [SECURITY.md](./SECURITY.md) | Isolation, JWT, rate limits, audit |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Docker Compose VPS deployment |
| [DECISIONS.md](./DECISIONS.md) | SRS vs implementation choices |
| [TESTING.md](./TESTING.md) | Vitest, tenant isolation tests |
| [OVERNIGHT_IMPLEMENTATION_REPORT.md](./OVERNIGHT_IMPLEMENTATION_REPORT.md) | Build session summary |

## License

UNLICENSED — private / proprietary.
