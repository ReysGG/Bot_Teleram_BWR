import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { Client } from "pg";

if (process.env.NODE_ENV === "production" || process.env.WEBTEST_ALLOW_SEED !== "true") {
  throw new Error("This script is only for an explicitly enabled disposable web-test database");
}

const connectionString = process.env.DATABASE_URL;
const configuredKey = process.env.DIGITAL_STOCK_ENCRYPTION_KEY;
if (!connectionString || !configuredKey) throw new Error("DATABASE_URL and DIGITAL_STOCK_ENCRYPTION_KEY are required");
const key = /^[a-f\d]{64}$/i.test(configuredKey)
  ? Buffer.from(configuredKey, "hex")
  : Buffer.from(configuredKey, "base64");
if (key.length !== 32) throw new Error("DIGITAL_STOCK_ENCRYPTION_KEY must decode to 32 bytes");

function encryptStock(content) {
  const plaintext = Buffer.from(
    "telegram-stock-file:v2;base64," + content.toString("base64"),
    "utf8",
  );
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from("telegram-digital-stock:v1", "utf8"));
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  plaintext.fill(0);
  return {
    encryptedPayload: encrypted.toString("base64"),
    encryptionIv: iv.toString("base64"),
    encryptionTag: cipher.getAuthTag().toString("base64"),
  };
}

function qrisCrc16(input) {
  let crc = 0xffff;
  for (const byte of Buffer.from(input, "utf8")) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function encryptPayload(payload) {
  const plaintext = Buffer.from(payload, "utf8");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from("telegram-digital-stock:v1", "utf8"));
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    encryptedPayload: encrypted.toString("base64"),
    encryptionIv: iv.toString("base64"),
    encryptionTag: cipher.getAuthTag().toString("base64"),
  };
}

const client = new Client({ connectionString });
try {
  await client.connect();
  const products = await client.query(`
    SELECT p."id", p."name"
    FROM "Product" p
    LEFT JOIN "DigitalStockItem" s ON s."productId" = p."id" AND s."status" IN ('AVAILABLE', 'RESERVED')
    WHERE p."status" = 'ACTIVE'
    GROUP BY p."id", p."name"
    HAVING count(s."id") = 0
    ORDER BY p."createdAt" ASC
  `);
  let inserted = 0;
  for (const product of products.rows) {
    const content = Buffer.from(
      `LOCAL WEB TEST STOCK\nProduct: ${product.name}\nProduct ID: ${product.id}\nThis credential exists only in the disposable local test database.\n`,
      "utf8",
    );
    const encrypted = encryptStock(content);
    const fingerprint = createHash("sha256")
      .update(Buffer.concat([Buffer.from("generic-binary:", "utf8"), content]))
      .digest("hex");
    await client.query(`
      INSERT INTO "DigitalStockItem" (
        "id", "productId", "originalFilename", "credentialFingerprint",
        "encryptedPayload", "encryptionIv", "encryptionTag", "status", "healthStatus",
        "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'AVAILABLE', 'HEALTHY', NOW(), NOW())
    `, [
      `webtest-stock-${randomBytes(8).toString("hex")}`,
      product.id,
      `web-test-${product.id}.txt`,
      fingerprint,
      encrypted.encryptedPayload,
      encrypted.encryptionIv,
      encrypted.encryptionTag,
    ]);
    inserted += 1;
    content.fill(0);
  }
  const qrisBody = "0002010102115204000053033605802ID5908K12 TEST6007JAKARTA";
  const qrisPayload = qrisBody + "6304" + qrisCrc16(qrisBody + "6304");
  const qrisEncrypted = encryptPayload(qrisPayload);
  const qrisFingerprint = createHash("sha256").update(qrisPayload).digest("hex");
  await client.query(`
    INSERT INTO "QrisMerchant" (
      "id", "slug", "name", "providerKey", "encryptedBasePayload",
      "basePayloadEncryptionIv", "basePayloadEncryptionTag", "payloadFingerprint",
      "enabled", "isActive", "createdBy", "updatedBy", "createdAt", "updatedAt"
    ) VALUES ($1, 'webtest-qris', 'Local Web Test QRIS', 'DANA', $2, $3, $4, $5, true, true, 'webtest-seed', 'webtest-seed', NOW(), NOW())
    ON CONFLICT ("slug") DO UPDATE SET
      "encryptedBasePayload" = EXCLUDED."encryptedBasePayload",
      "basePayloadEncryptionIv" = EXCLUDED."basePayloadEncryptionIv",
      "basePayloadEncryptionTag" = EXCLUDED."basePayloadEncryptionTag",
      "payloadFingerprint" = EXCLUDED."payloadFingerprint",
      "enabled" = true,
      "isActive" = true,
      "updatedBy" = 'webtest-seed',
      "updatedAt" = NOW()
  `, [
    "webtest-qris-merchant",
    qrisEncrypted.encryptedPayload,
    qrisEncrypted.encryptionIv,
    qrisEncrypted.encryptionTag,
    qrisFingerprint,
  ]);
  await client.query(`
    INSERT INTO "StoreRuntimeSetting" ("id", "qrisDanaEnabled", "walletCheckoutEnabled", "mixedWalletQrisEnabled", "walletTopupEnabled", "createdAt", "updatedAt")
    VALUES ('global', true, true, true, true, NOW(), NOW())
    ON CONFLICT ("id") DO UPDATE SET "qrisDanaEnabled" = true, "walletCheckoutEnabled" = true, "mixedWalletQrisEnabled" = true, "walletTopupEnabled" = true, "updatedAt" = NOW()
  `);
  console.log(JSON.stringify({ productsSeeded: inserted }));
} finally {
  key.fill(0);
  await client.end().catch(() => {});
}
