# Independent Telegram Store

Independent Next.js/TypeScript Telegram store for digital products delivered as JSON files. The application owns its catalog, encrypted inventory, checkout, payment records, fulfillment, admin dashboard, database, and deployment.

It does not call or share business data with Market Project. The only planned shared infrastructure is a neutral DANA Bridge Relay that routes one payment event to exactly one store claim.

## Implemented MVP

- Admin login with signed, HTTP-only sessions.
- Product creation and active/inactive status.
- Bulk stock-file upload with click or drag-and-drop from the admin dashboard.
- AES-256-GCM encryption for complete JSON files at rest.
- Automatic and admin-triggered stock checker: HTTP 2xx is healthy, HTTP 401/402 is unusable and removed from sale, other results are errors.
- Telegram `/start`, `/catalog`, `/orders`, `/balance`, `/topup`, `/myid`, and admin-only `/stock`.
- Telegram username/display-name checkout with no email prompt and update idempotency.
- Payment-time stock allocation and unique billed amount allocation.
- Neutral relay claim registration and signed payment callback.
- Dedicated Android DANA bridge callback with signed raw-notification matching.
- Manual admin payment confirmation for local testing/fallback.
- Telegram outbox and `sendDocument` delivery.
- At-most-once credential delivery receipts.
- Invoice expiry with idempotent stock restoration.
- Paid preorder mode with per-product ETA and queue limits.
- FIFO stock allocation from new healthy uploads to the oldest paid preorder.
- Amount-specific QRIS PNG generation from a validated base QRIS payload.
- Wallet saldo with append-only transactions, QRIS/DANA top ups, balance checkout,
  admin adjustments, and definite-delivery-failure refunds.
- One global active unique-code pool for orders and top ups, limited to Rp1-Rp99.
- One active unpaid invoice per Telegram chat, five-minute expiry, and buyer-side
  cancellation with confirmation before another checkout can be created.
- Product-aware custom order quantity up to 750 accounts, bounded by sellable
  stock/preorder capacity and safe stored-payment totals.
- Large digital orders are delivered in deterministic bundles of at most 100
  units; K12/TXT stays combined and mixed/generic inventory uses ZIP.
- Paginated admin inventory tables with 20 files per page.
- Telegram stock indicators for selected quantity, temporary checkout locks, and
  global sold-out/restock broadcasts.
- Delivered stock remains in Terjual until an admin explicitly archives it.
- Server-side SMSPool admin console for balance, one-time number ordering,
  active OTP monitoring, order history, and provider cancellation/refunds.

## Stock Lifecycle

```text
uploaded -> AVAILABLE/UNKNOWN
checked 2xx -> AVAILABLE/HEALTHY -> eligible for sale
checked 401/402 -> BANNED -> excluded from sale
paid DANA / wallet checkout -> RESERVED
successful delivery -> DELIVERED + encrypted archive
expired unpaid invoice -> no stock state change
paid preorder without stock -> PAID_WAITING_STOCK
new healthy stock -> RESERVED for oldest paid preorder -> delivery queue
```

## Preorder Flow

Preorder is used only when a product has no sellable healthy stock. Admins can
configure an ETA and maximum active queue for each product. Checkout and payment
matching remain identical to a normal order, but a paid preorder waits in
`PAID_WAITING_STOCK` without claiming a nonexistent stock item.

Stock upload, manual health checks, stock restoration, and the notification cron
all trigger the same transactional FIFO allocator. The allocator shares the
checkout advisory lock, reserves one stock item for one order, and creates the
same deduplicated digital-delivery notification used by normal checkout.

Sold stock is not deleted immediately. The encrypted payload remains retained in PostgreSQL for audit and delivery-deduplication. It stays in Terjual and is excluded from future sales; the scheduled checker continues monitoring it so a later HTTP 401/402 remains visible in both Terjual and Banned. Arsip is reserved for an explicit admin action. Add a retention/redaction policy later if legal or operational requirements demand deletion after a fixed period.

Raw files should only exist long enough to upload them through `/admin`. After a verified import, remove the raw local copy using your normal secure file-management process. Never commit credential files. The repository ignores `*.9router.*.json` and `private-stock/`.

## Local Setup

1. Copy `.env.example` to `.env` and configure a separate PostgreSQL database.
2. Generate an encryption key:

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
   ```

3. Generate the admin password hash:

   ```powershell
   npm run hash-password -- "use-a-long-unique-password"
   ```

4. Apply migrations and run the application:

   ```powershell
   npx prisma migrate deploy
   npm run dev
   ```

5. Open `http://localhost:3000/admin` and create a product before uploading stock.

## Docker

The Compose stack contains four services:

- `db`: isolated PostgreSQL 17 database.
- `migrate`: one-shot Prisma migration job.
- `app`: non-root standalone Next.js container.
- `scheduler`: calls notification, expiry, and automatic stock-health workers.

Create the local Docker environment file, replace every placeholder, then start the stack:

```powershell
Copy-Item .env.docker.example .env.docker
npm run hash-password -- "use-a-long-unique-password"
npm run docker:config
npm run docker:build
npm run docker:up
```

If a plaintext password was temporarily placed in `ADMIN_PASSWORD_HASH`, convert it in place without printing either the password or hash:

```powershell
npm run admin:secure-password
```

The script stores the bcrypt value using single quotes so Docker Compose does not interpolate its `$` characters.

The app is available at `http://localhost:3000`. View application logs with:

```powershell
npm run docker:logs
```

`.env.docker` is ignored by Git. For production, use the deployment platform's secret manager rather than copying the local environment file to source control.

## Stock Checker Contract

Set `STOCK_HEALTHCHECK_URL` to the server-side endpoint that validates an account. The checker sends:

```text
Authorization: Bearer <accessToken from encrypted JSON>
ChatGPT-Account-Id: <providerSpecificData.chatgptAccountId, when present>
```

The response body is never stored or logged.

| HTTP result | Inventory result |
| --- | --- |
| 200-299 | `HEALTHY` |
| 401 or 402 | `BANNED` and removed from sale |
| Anything else/network failure | `ERROR`, not treated as banned |

The checker URL is environment-controlled and must use HTTPS, except localhost during development.

The Docker worker calls `/api/cron/stock/health` every 30 seconds. It checks
unchecked or stale `AVAILABLE`, `BANNED`, and `DELIVERED` items in bounded batches,
then runs the preorder allocator when an account becomes healthy again. Configure
the target freshness and batch size with `STOCK_AUTO_CHECK_INTERVAL_SECONDS` and
`STOCK_AUTO_CHECK_BATCH_SIZE`; set `STOCK_AUTO_CHECK_ENABLED=false` to pause it.

## Telegram Webhook

Verify the configured bot and install its command menu without displaying the token:

```powershell
npm run telegram:configure
```

After deployment, register the webhook using secrets from the deployment environment:

```powershell
curl.exe -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" `
  -d "url=https://<APP_DOMAIN>/api/telegram/webhook" `
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

Never paste real tokens into source files, documentation, screenshots, or chat output.

Set `PAYMENT_QRIS_BASE_PAYLOAD` to the decoded static merchant QRIS payload to
send a newly generated QR PNG with the exact invoice amount. The generator sets
dynamic point-of-initiation mode, inserts tag `54`, and recalculates CRC16.
`PAYMENT_QRIS_IMAGE_URL` remains available as a fallback static image.

When `APP_URL` has been changed to the final public HTTPS domain, the repository can register the webhook directly from `.env.docker`:

```powershell
npm run telegram:webhook
```

## Payment Relay

The store registers an active claim at:

```text
POST <DANA_BRIDGE_RELAY_URL>/v1/payment-claims
```

The relay callback is:

```text
POST /api/bridge/payment-event
X-Relay-Timestamp: Unix milliseconds
X-Relay-Signature: HMAC-SHA256(timestamp + "." + rawBody)
```

The callback only confirms an exact claim ID, store ID, order ID, amount, and payment time window. The neutral relay itself is not included in this repository yet.

## Dedicated Android Bridge

For a phone and DANA merchant account used only by this store, install the
store-specific Android project in `android/dana-notification-bridge`. It posts to:

```text
POST /api/bridge/android/notification
POST /api/bridge/android/heartbeat
X-Bridge-Timestamp: Unix milliseconds
X-Bridge-Signature: HMAC-SHA256(timestamp + "." + rawBody)
```

Configure a new `DANA_ANDROID_BRIDGE_SECRET`; do not reuse the relay callback
secret or a secret from another store. The server accepts only `id.dana` and
`id.dana.kasir`, parses one incoming Rupiah amount, and confirms payment only
when exactly one pending order or wallet top up matches the amount and payment
window. Active order and top-up invoices share the same Rp1-Rp99 unique-code
pool and final-amount collision check. If no safe code remains, checkout is
rejected until an active invoice is paid or expires.

Keep `DANA_ANDROID_BRIDGE_ENABLED=false` if the same DANA/QRIS merchant account
still feeds another store. In that case use the neutral relay/global payment
registry so one notification can have only one owner.

## Workers

`vercel.json` schedules:

- `/api/cron/notifications` every minute.
- `/api/cron/orders/expire` every five minutes.
- `/api/cron/stock/health` every minute (Vercel minimum; Docker uses 30 seconds).

Docker keeps the regular notification/preorder sweep every 10 seconds and runs
two dedicated notification workers every 2 seconds in batches of 75. Database
leases and delivery receipts keep concurrent claims and digital delivery
idempotent.
Product creation and stock upload also trigger the worker immediately so product
announcements, restock notices, and paid digital deliveries do not wait for the
next scheduler tick.

Vercel Cron uses `CRON_SECRET`; set it to the same value as `APP_CRON_SECRET`. An external scheduler may call the routes with `Authorization: Bearer <APP_CRON_SECRET>`.

## Validation

```powershell
npm test
npm run typecheck
npm run lint
npm run build
```

`tests/preorder-db.test.ts` adds opt-in PostgreSQL integration coverage for
concurrent preorder limits, FIFO allocation, allocation deduplication, and full
stock release after invoice expiry. Live DANA relay behavior should still be
verified end-to-end when the neutral relay is connected.
