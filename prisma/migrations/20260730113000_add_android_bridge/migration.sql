ALTER TABLE "BridgePaymentEvent"
ADD COLUMN "source" TEXT NOT NULL DEFAULT 'RELAY',
ADD COLUMN "deviceId" TEXT,
ADD COLUMN "packageName" TEXT,
ALTER COLUMN "claimId" DROP NOT NULL,
ALTER COLUMN "amount" DROP NOT NULL;

CREATE INDEX "BridgePaymentEvent_source_deviceId_receivedAt_idx"
ON "BridgePaymentEvent"("source", "deviceId", "receivedAt");

CREATE TABLE "BridgeDeviceStatus" (
    "deviceId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'ANDROID',
    "queueSize" INTEGER NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BridgeDeviceStatus_pkey" PRIMARY KEY ("deviceId")
);

CREATE INDEX "BridgeDeviceStatus_source_lastSeenAt_idx"
ON "BridgeDeviceStatus"("source", "lastSeenAt");
