-- CreateEnum
CREATE TYPE "StoreApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DomainRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'ASSIGNED');

-- CreateEnum
CREATE TYPE "EmailVerificationSubject" AS ENUM ('USER', 'CUSTOMER');

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "emailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "phone" DROP NOT NULL;

-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "approvalReason" TEXT,
ADD COLUMN     "approvalStatus" "StoreApprovalStatus" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "emailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "phoneVerified" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "domain_requests" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "requestedLabel" TEXT NOT NULL,
    "requestedHostname" TEXT NOT NULL,
    "status" "DomainRequestStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "domain_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification_tokens" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "subjectType" "EmailVerificationSubject" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "domain_requests_storeId_idx" ON "domain_requests"("storeId");

-- CreateIndex
CREATE INDEX "domain_requests_status_idx" ON "domain_requests"("status");

-- CreateIndex
CREATE INDEX "email_verification_tokens_subjectType_subjectId_idx" ON "email_verification_tokens"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "email_verification_tokens_expiresAt_idx" ON "email_verification_tokens"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "customers_storeId_email_key" ON "customers"("storeId", "email");

-- CreateIndex
CREATE INDEX "stores_approvalStatus_idx" ON "stores"("approvalStatus");

-- AddForeignKey
ALTER TABLE "stores" ADD CONSTRAINT "stores_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domain_requests" ADD CONSTRAINT "domain_requests_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domain_requests" ADD CONSTRAINT "domain_requests_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

