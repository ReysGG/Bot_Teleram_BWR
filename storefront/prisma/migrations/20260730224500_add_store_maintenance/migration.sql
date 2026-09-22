CREATE TABLE "StoreRuntimeSetting" (
  "id" TEXT NOT NULL,
  "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
  "maintenanceMessage" TEXT,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StoreRuntimeSetting_pkey" PRIMARY KEY ("id")
);
