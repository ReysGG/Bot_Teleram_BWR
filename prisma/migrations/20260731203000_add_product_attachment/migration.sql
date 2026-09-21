ALTER TABLE "Product"
  ADD COLUMN "attachmentOriginalFilename" TEXT,
  ADD COLUMN "attachmentMimeType" TEXT,
  ADD COLUMN "attachmentEncryptedPayload" TEXT,
  ADD COLUMN "attachmentEncryptionIv" TEXT,
  ADD COLUMN "attachmentEncryptionTag" TEXT,
  ADD COLUMN "attachmentUpdatedAt" TIMESTAMP(3);
