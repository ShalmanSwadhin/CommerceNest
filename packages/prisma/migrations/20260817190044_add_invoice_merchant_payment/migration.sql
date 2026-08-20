-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID');

-- CreateEnum
CREATE TYPE "MerchantPaymentMethod" AS ENUM ('MANUAL_BKASH', 'MANUAL_BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "MerchantPaymentStatus" AS ENUM ('PENDING_VERIFICATION', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "billingPeriodId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "subscriptionAmount" DECIMAL(12,2) NOT NULL,
    "platformFeeAmount" DECIMAL(12,2) NOT NULL,
    "adjustmentAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "amountPaid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "creditApplied" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_payments" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "method" "MerchantPaymentMethod" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "referenceId" TEXT NOT NULL,
    "transferDate" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "status" "MerchantPaymentStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchant_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invoices_billingPeriodId_key" ON "invoices"("billingPeriodId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoiceNumber_key" ON "invoices"("invoiceNumber");

-- CreateIndex
CREATE INDEX "invoices_storeId_status_idx" ON "invoices"("storeId", "status");

-- CreateIndex
CREATE INDEX "invoices_storeId_issueDate_idx" ON "invoices"("storeId", "issueDate");

-- CreateIndex
CREATE INDEX "invoices_status_dueDate_idx" ON "invoices"("status", "dueDate");

-- CreateIndex
CREATE INDEX "merchant_payments_storeId_status_idx" ON "merchant_payments"("storeId", "status");

-- CreateIndex
CREATE INDEX "merchant_payments_invoiceId_idx" ON "merchant_payments"("invoiceId");

-- CreateIndex
CREATE INDEX "merchant_payments_status_submittedAt_idx" ON "merchant_payments"("status", "submittedAt");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_billingPeriodId_fkey" FOREIGN KEY ("billingPeriodId") REFERENCES "billing_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_payments" ADD CONSTRAINT "merchant_payments_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_payments" ADD CONSTRAINT "merchant_payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_payments" ADD CONSTRAINT "merchant_payments_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Database-level duplicate-transaction-reference guard (Phase 3 requirement:
-- "database-level constraints where appropriate, application checks alone
-- are insufficient"). Scoped to non-terminal statuses (not a plain
-- @@unique in schema.prisma, which can't express a WHERE clause) so the
-- same real bKash/bank reference can never back two simultaneously-live
-- claims — across ANY store, since a real transaction reference cannot
-- legitimately belong to two different claims at once — while still
-- allowing a merchant to correct and resubmit the same reference after an
-- earlier claim was REJECTED or CANCELLED.
CREATE UNIQUE INDEX "merchant_payments_method_referenceId_active_key"
  ON "merchant_payments"("method", "referenceId")
  WHERE "status" IN ('PENDING_VERIFICATION', 'APPROVED');

-- A real Postgres SEQUENCE, not a read-modify-write counter in a settings
-- table — nextval() is atomic and collision-free under any concurrency
-- without needing an explicit lock, which is exactly what a human-readable,
-- globally-unique, sequential invoice number needs.
CREATE SEQUENCE IF NOT EXISTS "invoice_number_seq" START 1;
