-- CreateEnum
CREATE TYPE "ThemeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED');

-- AlterTable
ALTER TABLE "support_tickets" ADD COLUMN     "themeRequestStatus" "ThemeRequestStatus";

-- CreateIndex
CREATE INDEX "support_tickets_themeRequestStatus_idx" ON "support_tickets"("themeRequestStatus");
