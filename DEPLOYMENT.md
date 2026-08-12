# CommerceNest Deployment

Single-VPS deployment using Docker Compose. Targets a production domain layout on `commercenest.com`.

## Domain layout

| Host | Service | Compose service |
|------|---------|-----------------|
| `admin.commercenest.com` | Master Admin panel | `admin-panel` |
| `app.commercenest.com` | Store dashboard | `store-dashboard` |
| `api.commercenest.com` | REST API | `api` |
| `{slug}.commercenest.com` | Customer storefront | `storefront` (or per-store builds) |

Local development uses ports instead:

| Service | URL |
|---------|-----|
| API | http://localhost:4000 |
| Admin | http://localhost:5173 |
| Dashboard | http://localhost:5174 |
| Storefront | http://localhost:5175 |

Store subdomains locally: `{slug}.commercenest.local` (requires `/etc/hosts` or DNS wildcard).

---

## Prerequisites (VPS)

- Ubuntu 22.04+ or similar Linux
- Docker Engine + Docker Compose v2
- Domain DNS pointing to VPS IP (A records for `admin`, `app`, `api`, `*.commercenest.com`)
- Reverse proxy with TLS (Caddy, nginx, or Traefik) — not included in compose file

---

## Quick deploy

### 1. Clone and configure

```bash
git clone <repo> /opt/commercenest
cd /opt/commercenest
cp .env.example .env
```

Production `.env` essentials:

```env
NODE_ENV=production
PORT=4000

DATABASE_URL=postgresql://commercenest:<strong-password>@postgres:5432/commercenest?schema=public
REDIS_URL=redis://redis:6379

JWT_ACCESS_SECRET=<random-32+-chars>
JWT_REFRESH_SECRET=<random-32+-chars>
COOKIE_SECURE=true

PLATFORM_DOMAIN=commercenest.com
CORS_ORIGINS=https://admin.commercenest.com,https://app.commercenest.com

CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...

VITE_API_BASE_URL=https://api.commercenest.com
```

### 2. Start stack

```bash
docker compose up -d --build
```

Services in `docker-compose.yml`:

| Service | Internal port | Host port |
|---------|---------------|-----------|
| postgres | 5432 | 5432 |
| redis | 6379 | 6379 |
| api | 4000 | 4000 |
| admin-panel | 80 | 8081 |
| store-dashboard | 80 | 8082 |
| storefront | 80 | 8083 |

### 3. Run migrations

CommerceNest ships a committed migration history (`packages/prisma/migrations/`). **Production and staging must always use `prisma migrate deploy`** — never `db push`. `db push` diffs the live schema and can silently generate a destructive plan (dropped columns/tables) with no review step and no migration record; it exists only for local prototyping (see [DATABASE.md](./DATABASE.md#migrations)).

First deploy and every subsequent deploy:

```bash
docker compose exec api sh -c "cd /app/packages/prisma && npx prisma migrate deploy"
```

This is idempotent — safe to run on every deploy, including ones with no new migrations (it's a no-op if the database is already up to date). Wire it into your deploy script/CI job so it always runs before the API container starts serving traffic.

Seed (optional, non-production only):

```bash
docker compose exec api node dist/seed.js
```

### 4. Reverse proxy

Example nginx upstream blocks:

```nginx
upstream cn_api { server 127.0.0.1:4000; }
upstream cn_admin { server 127.0.0.1:8081; }
upstream cn_app { server 127.0.0.1:8082; }
upstream cn_store { server 127.0.0.1:8083; }
```

Terminate TLS at the proxy. Set `X-Forwarded-Proto` and `X-Forwarded-For` — API has `trust proxy` enabled.

For wildcard storefront subdomains, route `*.commercenest.com` to the storefront container and pass slug from hostname (future enhancement — V1 storefront build uses `VITE_STORE_SLUG` at build time).

---

## Docker images

Each app has a multi-stage Dockerfile:

- `apps/api/Dockerfile` — Node 20 Alpine, non-root `cn` user
- `apps/admin-panel/Dockerfile` — Vite build → nginx static
- `apps/store-dashboard/Dockerfile` — same pattern
- `apps/storefront/Dockerfile` — same pattern, accepts `VITE_STORE_SLUG` build arg

Rebuild after code changes:

```bash
docker compose build api admin-panel store-dashboard storefront
docker compose up -d
```

---

## Database migrations: expand-first

Avoid destructive migrations on live tenants:

### Phase 1 — Expand

```sql
-- Example: add nullable column
ALTER TABLE orders ADD COLUMN new_field TEXT;
```

Deploy new API that reads/writes both old and new fields.

### Phase 2 — Migrate data

Backfill script or background job.

### Phase 3 — Contract

Deploy API using new field only.

### Phase 4 — Cleanup

Drop old column in separate migration after rollback window closes.

Prisma workflow:

```bash
npm run db:migrate    # dev: creates migration SQL
# CI/CD: prisma migrate deploy
```

Never `migrate reset` in production.

---

## Rollback strategy

### Application rollback

1. Tag every production image: `commercenest-api:v1.0.3`
2. On failure, redeploy previous tag:

```bash
docker compose pull   # if using registry
# or
git checkout v1.0.2
docker compose build api
docker compose up -d api
```

3. Frontends are static — rollback by redeploying previous nginx image tag

### Database rollback

- **Forward-only** migrations preferred
- Keep migrations backward-compatible for at least one release
- If rollback requires schema revert, maintain down migrations manually (Prisma doesn't auto-generate down)
- Restore from Postgres volume snapshot as last resort:

```bash
docker compose down
# restore pgdata volume from backup
docker compose up -d
```

---

## Health checks

```bash
curl https://api.commercenest.com/api/health
```

Expected:

```json
{
  "ok": true,
  "service": "commercenest-api",
  "brand": "CommerceNest",
  "database": "up",
  "redis": "up"
}
```

Compose includes healthchecks for Postgres and Redis; API depends on both.

---

## Dev dependencies only

For local development without full stack:

```bash
docker compose -f docker-compose.dev.yml up -d
npm run dev
```

Run API and frontends on host Node — faster hot reload.

---

## Monitoring (recommended)

- Log aggregation from API (Pino JSON → Loki/CloudWatch)
- Uptime check on `/api/health`
- Postgres connection and disk alerts
- Redis memory alerts
- Audit log review for impersonation sessions

---

## Known deployment limitations (V1)

- Storefront Docker image bakes a single `VITE_STORE_SLUG` — multi-tenant subdomains need dynamic slug resolution or SSR (future)
- Custom domain DNS/SSL automation not implemented
- No built-in CI/CD pipeline in repo
- Root `npm run build` fails on `@commercenest/prisma` missing `build` script — build apps individually or use Docker
- Host machine may not have Docker installed — use dev compose or external managed Postgres/Redis

See [OVERNIGHT_IMPLEMENTATION_REPORT.md](./OVERNIGHT_IMPLEMENTATION_REPORT.md).
