ALTER TABLE "StoreRuntimeSetting"
  ADD COLUMN "qrisDanaEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "walletCheckoutEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "mixedWalletQrisEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "walletTopupEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "paymentMethodsUpdatedBy" TEXT,
  ADD COLUMN "paymentMethodsUpdatedAt" TIMESTAMP(3);
