-- CreateEnum
CREATE TYPE "TrialLeadStatus" AS ENUM ('LEAD', 'TRIAL_PENDING', 'TRIAL_ACTIVE', 'TRIAL_EXPIRED', 'CONVERTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CustomThemeAvailability" AS ENUM ('INCLUDED', 'ADDITIONAL_CHARGE');

-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "isTrial" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "trialExpiresAt" TIMESTAMP(3),
ADD COLUMN     "trialStartedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "templates" ADD COLUMN     "category" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "displayOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "isPreset" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "packages" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "monthlyPrice" DECIMAL(12,2) NOT NULL,
    "yearlyPrice" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "maxProducts" INTEGER,
    "maxStaff" INTEGER,
    "maxOrders" INTEGER,
    "storageLimitMb" INTEGER,
    "features" JSONB NOT NULL DEFAULT '[]',
    "trialDays" INTEGER NOT NULL DEFAULT 7,
    "customThemeAvailability" "CustomThemeAvailability" NOT NULL DEFAULT 'ADDITIONAL_CHARGE',
    "supportLevel" TEXT NOT NULL DEFAULT 'basic',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trial_leads" (
    "id" TEXT NOT NULL,
    "prospectName" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "category" TEXT,
    "catalogSize" TEXT,
    "message" TEXT,
    "status" "TrialLeadStatus" NOT NULL DEFAULT 'LEAD',
    "storeId" TEXT,
    "trialDurationDays" INTEGER,
    "rejectionReason" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trial_leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "packages_slug_key" ON "packages"("slug");

-- CreateIndex
CREATE INDEX "packages_active_displayOrder_idx" ON "packages"("active", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "trial_leads_storeId_key" ON "trial_leads"("storeId");

-- CreateIndex
CREATE INDEX "trial_leads_status_createdAt_idx" ON "trial_leads"("status", "createdAt");

-- CreateIndex
CREATE INDEX "trial_leads_email_idx" ON "trial_leads"("email");

-- CreateIndex
CREATE INDEX "stores_isTrial_trialExpiresAt_idx" ON "stores"("isTrial", "trialExpiresAt");

-- CreateIndex
CREATE INDEX "templates_isPreset_displayOrder_idx" ON "templates"("isPreset", "displayOrder");

-- AddForeignKey
ALTER TABLE "trial_leads" ADD CONSTRAINT "trial_leads_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trial_leads" ADD CONSTRAINT "trial_leads_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
