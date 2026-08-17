-- CreateEnum
CREATE TYPE "BillingPeriodStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "BillingEntryType" AS ENUM ('SUBSCRIPTION_CHARGE', 'PLATFORM_FEE', 'ADJUSTMENT', 'CREDIT', 'PAYMENT');

-- AlterTable
ALTER TABLE "packages" ADD COLUMN     "platformFeeRate" DECIMAL(6,4) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "billing_periods" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "BillingPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "planSlug" TEXT NOT NULL,
    "planName" TEXT NOT NULL,
    "subscriptionPrice" DECIMAL(12,2) NOT NULL,
    "platformFeeRate" DECIMAL(6,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "eligibleGmv" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "platformFeeAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_ledger_entries" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "billingPeriodId" TEXT,
    "type" "BillingEntryType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "description" TEXT NOT NULL,
    "referenceType" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "billing_periods_storeId_status_idx" ON "billing_periods"("storeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "billing_periods_storeId_periodStart_key" ON "billing_periods"("storeId", "periodStart");

-- CreateIndex
CREATE INDEX "billing_ledger_entries_storeId_createdAt_idx" ON "billing_ledger_entries"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "billing_ledger_entries_billingPeriodId_idx" ON "billing_ledger_entries"("billingPeriodId");

-- CreateIndex
CREATE UNIQUE INDEX "billing_ledger_entries_storeId_referenceType_referenceId_ty_key" ON "billing_ledger_entries"("storeId", "referenceType", "referenceId", "type");

-- AddForeignKey
ALTER TABLE "billing_periods" ADD CONSTRAINT "billing_periods_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_ledger_entries" ADD CONSTRAINT "billing_ledger_entries_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_ledger_entries" ADD CONSTRAINT "billing_ledger_entries_billingPeriodId_fkey" FOREIGN KEY ("billingPeriodId") REFERENCES "billing_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;
