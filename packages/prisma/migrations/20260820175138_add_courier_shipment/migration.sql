-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('CREATED', 'IN_REVIEW', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'PARTIAL_DELIVERED', 'ON_HOLD', 'CANCELLED', 'RETURNED', 'FAILED');

-- CreateTable
CREATE TABLE "courier_accounts" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "credentialsEncrypted" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "lastTestedAt" TIMESTAMP(3),
    "lastTestOk" BOOLEAN,
    "lastTestMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courier_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipments" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "consignmentId" TEXT,
    "trackingCode" TEXT,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'CREATED',
    "rawStatus" TEXT,
    "codAmount" DECIMAL(12,2) NOT NULL,
    "deliveryCharge" DECIMAL(12,2),
    "recipientName" TEXT NOT NULL,
    "recipientPhone" TEXT NOT NULL,
    "recipientAddress" TEXT NOT NULL,
    "note" TEXT,
    "courierResponse" JSONB,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "courier_accounts_storeId_enabled_idx" ON "courier_accounts"("storeId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "courier_accounts_storeId_provider_key" ON "courier_accounts"("storeId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "shipments_orderId_key" ON "shipments"("orderId");

-- CreateIndex
CREATE INDEX "shipments_storeId_status_idx" ON "shipments"("storeId", "status");

-- CreateIndex
CREATE INDEX "shipments_provider_consignmentId_idx" ON "shipments"("provider", "consignmentId");

-- CreateIndex
CREATE INDEX "shipments_provider_trackingCode_idx" ON "shipments"("provider", "trackingCode");

-- AddForeignKey
ALTER TABLE "courier_accounts" ADD CONSTRAINT "courier_accounts_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
