-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "DigitalStockStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'DELIVERED', 'BANNED', 'DISABLED');

-- CreateEnum
CREATE TYPE "StockHealthStatus" AS ENUM ('UNKNOWN', 'HEALTHY', 'BANNED', 'ERROR');

-- CreateEnum
CREATE TYPE "BotSessionState" AS ENUM ('BROWSING', 'AWAITING_EMAIL');

-- CreateEnum
CREATE TYPE "TelegramUpdateStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'FULFILLING', 'COMPLETED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentClaimStatus" AS ENUM ('PENDING', 'REGISTERED', 'LOCAL_ONLY', 'CONFIRMED', 'EXPIRED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "BridgeEventStatus" AS ENUM ('RECEIVED', 'CONFIRMED', 'DUPLICATE', 'REJECTED');

-- CreateEnum
CREATE TYPE "TelegramNotificationStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'MANUAL_REVIEW');

-- CreateEnum
CREATE TYPE "DeliveryReceiptStatus" AS ENUM ('SENDING', 'SENT', 'FAILED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "imageUrl" TEXT,
    "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DigitalStockItem" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "credentialFingerprint" TEXT NOT NULL,
    "encryptedPayload" TEXT NOT NULL,
    "encryptionIv" TEXT NOT NULL,
    "encryptionTag" TEXT NOT NULL,
    "status" "DigitalStockStatus" NOT NULL DEFAULT 'AVAILABLE',
    "healthStatus" "StockHealthStatus" NOT NULL DEFAULT 'UNKNOWN',
    "healthHttpStatus" INTEGER,
    "healthError" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "reservedOrderId" TEXT,
    "reservedAt" TIMESTAMP(3),
    "deliveredOrderId" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DigitalStockItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotSession" (
    "chatId" TEXT NOT NULL,
    "state" "BotSessionState" NOT NULL DEFAULT 'BROWSING',
    "cart" JSONB,
    "buyerEmail" TEXT,
    "checkoutKey" TEXT,
    "activeOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotSession_pkey" PRIMARY KEY ("chatId")
);

-- CreateTable
CREATE TABLE "TelegramProcessedUpdate" (
    "updateId" BIGINT NOT NULL,
    "chatId" TEXT NOT NULL,
    "status" "TelegramUpdateStatus" NOT NULL DEFAULT 'PROCESSING',
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "leaseUntil" TIMESTAMP(3) NOT NULL,
    "lastError" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramProcessedUpdate_pkey" PRIMARY KEY ("updateId")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "buyerEmail" TEXT NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "serviceFee" INTEGER NOT NULL,
    "grandTotal" INTEGER NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "stockReleasedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productNameSnapshot" TEXT NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "stockItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'DANA_RELAY',
    "billedAmount" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BridgePaymentClaim" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "PaymentClaimStatus" NOT NULL DEFAULT 'PENDING',
    "registeredAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BridgePaymentClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BridgePaymentEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "orderId" TEXT,
    "amount" INTEGER NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "BridgeEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "payloadHash" TEXT NOT NULL,
    "reason" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BridgePaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramNotification" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "orderId" TEXT,
    "stockItemId" TEXT,
    "kind" TEXT NOT NULL,
    "status" "TelegramNotificationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SentDelivery" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "stockItemId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "status" "DeliveryReceiptStatus" NOT NULL DEFAULT 'SENDING',
    "telegramMessageId" TEXT,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SentDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- CreateIndex
CREATE INDEX "Product_status_createdAt_idx" ON "Product"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DigitalStockItem_credentialFingerprint_key" ON "DigitalStockItem"("credentialFingerprint");

-- CreateIndex
CREATE INDEX "DigitalStockItem_productId_status_healthStatus_idx" ON "DigitalStockItem"("productId", "status", "healthStatus");

-- CreateIndex
CREATE INDEX "DigitalStockItem_reservedOrderId_idx" ON "DigitalStockItem"("reservedOrderId");

-- CreateIndex
CREATE INDEX "DigitalStockItem_deliveredOrderId_idx" ON "DigitalStockItem"("deliveredOrderId");

-- CreateIndex
CREATE INDEX "TelegramProcessedUpdate_status_leaseUntil_idx" ON "TelegramProcessedUpdate"("status", "leaseUntil");

-- CreateIndex
CREATE INDEX "TelegramProcessedUpdate_expiresAt_idx" ON "TelegramProcessedUpdate"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_idempotencyKey_key" ON "Order"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Order_invoiceNumber_key" ON "Order"("invoiceNumber");

-- CreateIndex
CREATE INDEX "Order_chatId_createdAt_idx" ON "Order"("chatId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_status_expiresAt_idx" ON "Order"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "Order_paymentStatus_expiresAt_idx" ON "Order"("paymentStatus", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrderItem_stockItemId_key" ON "OrderItem"("stockItemId");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_orderId_key" ON "Payment"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_invoiceNumber_key" ON "Payment"("invoiceNumber");

-- CreateIndex
CREATE INDEX "Payment_status_billedAmount_expiresAt_idx" ON "Payment"("status", "billedAmount", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "BridgePaymentClaim_claimId_key" ON "BridgePaymentClaim"("claimId");

-- CreateIndex
CREATE UNIQUE INDEX "BridgePaymentClaim_orderId_key" ON "BridgePaymentClaim"("orderId");

-- CreateIndex
CREATE INDEX "BridgePaymentClaim_status_amount_expiresAt_idx" ON "BridgePaymentClaim"("status", "amount", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "BridgePaymentEvent_eventId_key" ON "BridgePaymentEvent"("eventId");

-- CreateIndex
CREATE INDEX "BridgePaymentEvent_claimId_idx" ON "BridgePaymentEvent"("claimId");

-- CreateIndex
CREATE INDEX "BridgePaymentEvent_status_postedAt_idx" ON "BridgePaymentEvent"("status", "postedAt");

-- CreateIndex
CREATE INDEX "BridgePaymentEvent_orderId_idx" ON "BridgePaymentEvent"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramNotification_dedupeKey_key" ON "TelegramNotification"("dedupeKey");

-- CreateIndex
CREATE INDEX "TelegramNotification_status_nextAttemptAt_idx" ON "TelegramNotification"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "TelegramNotification_orderId_idx" ON "TelegramNotification"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "SentDelivery_dedupeKey_key" ON "SentDelivery"("dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "SentDelivery_stockItemId_key" ON "SentDelivery"("stockItemId");

-- CreateIndex
CREATE INDEX "SentDelivery_orderId_idx" ON "SentDelivery"("orderId");

-- CreateIndex
CREATE INDEX "SentDelivery_status_createdAt_idx" ON "SentDelivery"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "DigitalStockItem" ADD CONSTRAINT "DigitalStockItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "DigitalStockItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgePaymentClaim" ADD CONSTRAINT "BridgePaymentClaim_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgePaymentEvent" ADD CONSTRAINT "BridgePaymentEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramNotification" ADD CONSTRAINT "TelegramNotification_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SentDelivery" ADD CONSTRAINT "SentDelivery_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SentDelivery" ADD CONSTRAINT "SentDelivery_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "DigitalStockItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
