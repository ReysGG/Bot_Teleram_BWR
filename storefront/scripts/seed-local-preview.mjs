import pg from "pg";

const { Client } = pg;
const connectionString = process.env.DATABASE_URL;
if (!connectionString || !connectionString.includes("storefront-db")) {
  throw new Error("Local preview seed requires the disposable storefront database");
}

const client = new Client({ connectionString });
await client.connect();
try {
  await client.query("BEGIN");
  const now = new Date();
  await client.query(`
    INSERT INTO "SellerAccount" ("id", "slug", "displayName", "status", "commissionBps", "policyVersion", "createdAt", "updatedAt")
    VALUES ('local-preview-seller', 'local-preview-seller', 'Local Preview Seller', 'ACTIVE', 1000, 1, $1, $1)
    ON CONFLICT ("slug") DO UPDATE SET "displayName" = EXCLUDED."displayName", "status" = 'ACTIVE', "updatedAt" = $1
  `, [now]);
  const seller = await client.query(`SELECT "id" FROM "SellerAccount" WHERE "slug" = 'local-preview-seller'`);
  const sellerId = seller.rows[0]?.id;
  if (!sellerId) throw new Error("local preview seller was not created");
  await client.query(`INSERT INTO "SellerWallet" ("sellerId", "pending", "available", "held", "debt", "updatedAt") VALUES ($1, 35000, 125000, 50000, 0, $2) ON CONFLICT ("sellerId") DO UPDATE SET "pending" = 35000, "available" = 125000, "held" = 50000, "debt" = 0, "updatedAt" = $2`, [sellerId, now]);
  await client.query(`INSERT INTO "SellerPayoutAccount" ("id", "sellerId", "bank", "holder", "masked", "encryptedPayload", "encryptionIv", "encryptionTag", "status", "verifiedAt", "createdAt") VALUES ('local-preview-payout', $1, 'Bank Preview', 'Local Preview Seller', '**** 4321', 'local-only', 'local-only', 'local-only', 'VERIFIED', $2, $2) ON CONFLICT ("id") DO NOTHING`, [sellerId, now]);

  const products = [
    ["local-preview-product-1", "local-chatgpt-business", "ChatGPT Business 1 Bulan - Preview", "Produk demo untuk meninjau alur seller dan stok lokal.", 50000],
    ["local-preview-product-2", "local-api-combo", "Paket API AI Combo - Preview", "Produk demo dengan stok digital sintetis.", 25000],
  ];
  for (const [id, slug, name, description, price] of products) {
    await client.query(`INSERT INTO "Product" ("id", "sellerId", "slug", "name", "description", "price", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $7) ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "description" = EXCLUDED."description", "price" = EXCLUDED."price", "updatedAt" = $7`, [id, sellerId, slug, name, description, price, now]);
    await client.query(`INSERT INTO "DigitalStockItem" ("id", "productId", "originalFilename", "credentialFingerprint", "encryptedPayload", "encryptionIv", "encryptionTag", "createdAt", "updatedAt") VALUES ($1, $2, 'preview-stock.txt', $3, 'local-preview-encrypted', 'local-preview-iv', 'local-preview-tag', $4, $4) ON CONFLICT ("id") DO NOTHING`, [`${id}-stock`, id, `${id}-fingerprint`, now]);
  }
  await client.query(`INSERT INTO "SellerProductDraft" ("id", "sellerId", "name", "description", "price", "status", "revision", "requestKey", "createdAt", "updatedAt") VALUES ('local-preview-draft-1', $1, 'Draft Produk Preview', 'Draft sintetis untuk meninjau antrean review seller.', 15000, 'SUBMITTED', 1, 'local-preview-draft-request', $2, $2) ON CONFLICT ("id") DO UPDATE SET "status" = 'SUBMITTED', "updatedAt" = $2`, [sellerId, now]);
  await client.query(`INSERT INTO "SellerProductDraft" ("id", "sellerId", "name", "description", "price", "status", "revision", "requestKey", "createdAt", "updatedAt") VALUES ('local-preview-draft-edit', $1, 'Draft Produk yang Bisa Diedit', 'Draft sintetis untuk meninjau halaman edit seller.', 18000, 'DRAFT', 1, 'local-preview-draft-edit-request', $2, $2) ON CONFLICT ("id") DO UPDATE SET "status" = 'DRAFT', "updatedAt" = $2`, [sellerId, now]);
  await client.query(`INSERT INTO "SellerWithdrawal" ("id", "sellerId", "accountId", "amount", "status", "requestKey", "version", "createdAt", "updatedAt") VALUES ('local-preview-withdrawal-1', $1, 'local-preview-payout', 50000, 'REQUESTED', 'local-preview-withdrawal-request', 1, $2, $2) ON CONFLICT ("id") DO NOTHING`, [sellerId, now]);
  await client.query("COMMIT");
  console.log("Local storefront preview seed ready");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
