# CommerceNest local bootstrap (Windows PowerShell)
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host "==> Installing dependencies"
npm install

Write-Host "==> Building shared types"
npm run build -w @commercenest/types

Write-Host "==> Generating Prisma client"
npm run generate -w @commercenest/prisma

if (-not (Test-Path "apps\api\.env")) {
  Copy-Item ".env.example" "apps\api\.env"
  Write-Host "Created apps/api/.env from .env.example — edit secrets before production use."
}

Write-Host @"

Next steps:
  1. Start Postgres + Redis (Docker): docker compose -f docker-compose.dev.yml up -d
     Or point DATABASE_URL at your own Postgres instance.
  2. Push schema:  npm run db:push
  3. Seed data:   npm run db:seed
  4. API:         npm run dev:api
  5. Admin:       npm run dev:admin        (http://localhost:5173)
  6. Dashboard:   npm run dev:dashboard    (http://localhost:5174)
  7. Storefront:  npm run dev:storefront   (http://localhost:5175)

Seed logins:
  Master Admin  admin@commercenest.com / Admin123!
  Store Owner   owner@techworld.bd / Owner123!
  Storefront    VITE_STORE_SLUG=techworld-bd
"@
