# Project Context: Fully Independent Telegram Store

## Correction: production bot identification (2026-09-22)

The user explicitly confirmed `@K12JsonStockBot` (ID `8875520688`) is the
production bot. The previous claim that a new testing bot was created was wrong:
an existing BotFather message was read and its production token was mistakenly
placed in a local environment. The local token was cleared; no production webhook
change is established by that operation. Do not infer no impact solely from a
healthy container. Dedicated testing credentials must be verified separately,
and local workers/pollers must never fall back to this production bot.

## User Goal

Create a fully independent Telegram commerce project at:

```text
C:\Users\David Boy\Documents\NextJS\telegram
```

The project is not part of BuildWithReys and must not depend on Market Project for catalog, checkout, order, stock, fulfillment, admin, database, or deployment.

The only component that may be shared is DANA Bridge.

## Final Architecture Decision

```text
Independent Telegram Store owns:
  Telegram bot and webhook
  product catalog
  product variants
  admin management
  buyer sessions and cart
  checkout pricing and vouchers
  unique payment amount allocation
  orders and payment state
  invoice expiry and stock restoration
  encrypted digital inventory
  digital fulfillment
  notification queue
  database
  deployment and secrets

BuildWithReys Market Project owns:
  nothing used by this new store

Shared component:
  DANA Bridge transport/relay only
```

Do not implement a signed Market Project API. Do not access the Market Project database. Do not copy its brand, production credentials, customer records, or stock.

## Existing Reference

The current bridge and store implementation can be inspected at:

```text
C:\Users\David Boy\Documents\NextJS\Market-Project
```

Use `DANA_BRIDGE_TELEGRAM_BLUEPRINT.md` to understand the proven event payload, HMAC signing, retry queue, notification parsing, payment matching, fulfillment concurrency, and operational risks.

This is reference material, not a runtime dependency.

## Shared DANA Bridge Problem

The current Android application has one notification endpoint. The user wants the DANA Bridge to be the only shared component between BuildWithReys and the independent store.

Sending the same notification independently to two store backends is unsafe:

```text
BuildWithReys active invoice : Rp25.347
Independent bot invoice      : Rp25.347
One DANA notification        : Rp25.347
```

Both stores could falsely confirm the same payment.

## Recommended Shared Bridge Design

Extract or create a neutral DANA Bridge Relay that is not owned by either store's business logic.

```text
DANA Android Notification Listener
  -> Neutral Bridge Relay
       -> global active-payment registry
       -> exact amount + time-window match
       -> exactly one ownerStoreId
       -> signed callback to the matching store
```

Each store registers active payment claims with the relay:

```text
claimId
ownerStoreId
externalOrderId
amount
createdAt
expiresAt
callbackUrl
callbackKeyId
status
```

The relay accepts a DANA event only when exactly one active claim matches. Ambiguous or unmatched events never confirm any store.

Alternative designs must be explicitly approved:

1. Separate Android device/account per store.
2. Mutually exclusive amount ranges coordinated across stores.
3. Multi-target Android delivery with a shared global amount allocator.

The neutral relay with claims is the recommended option.

## Proposed Independent Project Structure

```text
telegram/
  AGENTS.md
  PROJECT_CONTEXT.md
  DANA_BRIDGE_TELEGRAM_BLUEPRINT.md
  package.json
  .env.example
  prisma/
    schema.prisma
    migrations/
  src/
    app/
      api/
        telegram/webhook/route.ts
        bridge/payment-event/route.ts
        cron/orders/expire/route.ts
        cron/notifications/route.ts
        health/route.ts
      admin/
      page.tsx
    server/
      db/prisma.ts
      checkout/
      data/
      digital-stock/
      payment/
      security/
      telegram/
      validation/
    components/
    types/
  tests/
```

This can be a Next.js/TypeScript application deployed independently to Vercel, or a Node service plus separate admin UI. Default recommendation is one Next.js project for the first release.

## Proposed Database Domains

### Product

```text
id
slug
name
description
price
stock
fulfillmentType
autoDeliveryEnabled
status
createdAt
updatedAt
```

### ProductVariant

```text
id
productId
name
sku
price
stock
status
```

### DigitalStockItem

```text
id
productId
encryptedPayload
sourceName
status: available | delivered | disabled
orderId
orderItemId
deliveredAt
createdAt
updatedAt
```

### BotSession

```text
chatId
state
cart JSON
buyerName
buyerEmail
buyerWhatsapp
checkoutKey
activeOrderId
createdAt
updatedAt
```

### ProcessedTelegramUpdate

```text
updateId primary key
chatId
expiresAt
createdAt
```

### Order and OrderItem

Order owns buyer, subtotal, service fee, grand total, order status, payment status, expiry, and stock-release timestamps. OrderItem stores immutable product/variant snapshots.

### Payment

```text
id
orderId unique
invoiceNumber
method
billedAmount
status
verifiedBy
verifiedAt
expiresAt
createdAt
updatedAt
```

### BridgePaymentClaim

Local copy of the claim registered with the neutral bridge relay:

```text
claimId unique
orderId unique
amount
expiresAt
status
registeredAt
confirmedAt
```

### BridgePaymentEvent

```text
eventId unique
claimId
amount
postedAt
receivedAt
status
payloadHash
reason
```

### TelegramNotification

Use an outbox with pending/processing/sent/failed status, attempts, lease time, retry backoff, and last error.

### SentDelivery

```text
deliveryId primary key
orderId
chatId
sentAt
```

This prevents retry workers from sending one credential more than once.

## First Release Scope

Recommended digital-only MVP:

1. Independent admin login.
2. Product CRUD.
3. Encrypted digital stock upload/delete.
4. Telegram `/start`, catalog, product detail, and buy-now.
5. Require buyer email.
6. Create invoice and reserve stock transactionally.
7. Register active amount claim with shared bridge relay.
8. Send QRIS/payment amount to buyer.
9. Receive a signed routed payment event from relay.
10. Mark payment paid idempotently.
11. Allocate one digital stock item with row locking.
12. Send credential once through Telegram outbox.
13. Auto-complete digital order.
14. Expire unpaid invoice and restore stock.

Cart, vouchers, physical products, preorder, broadcast, and advanced reports can follow.

## Suggested Environment Placeholders

```env
DATABASE_URL=""
DIRECT_URL=""
AUTH_SECRET=""
ADMIN_EMAIL=""
ADMIN_PASSWORD=""

TELEGRAM_BOT_TOKEN=""
TELEGRAM_WEBHOOK_SECRET=""
APP_CRON_SECRET=""

DIGITAL_STOCK_ENCRYPTION_KEY=""

DANA_BRIDGE_RELAY_URL=""
DANA_BRIDGE_STORE_ID=""
DANA_BRIDGE_RELAY_SECRET=""
DANA_BRIDGE_CALLBACK_SECRET=""
```

No real values have been recorded.

## Security Requirements

- Verify Telegram webhook secret for every update.
- Claim `update_id` before processing.
- Use checkout idempotency keys.
- Allocate active payment amounts under a database lock.
- Register relay claims idempotently.
- Verify routed bridge callbacks with HMAC and timestamp.
- Reject ambiguous bridge events.
- Encrypt digital stock with AES-256-GCM.
- Use row locking or `FOR UPDATE SKIP LOCKED` for allocation.
- Restore reserved stock exactly once on expiry.
- Record sent delivery IDs.
- Never log payment secrets or digital credentials.
- Rate-limit public and signed endpoints.

## Decisions for the New Session

Recommended defaults:

```text
App framework     : Next.js + TypeScript
Database          : separate Supabase/PostgreSQL
Deployment        : independent Vercel project
Initial products  : digital only
Bridge sharing    : neutral relay with payment claims
Brand dependency  : none
Market dependency : none
```

The new session should confirm whether to build the neutral relay inside this project as a separate module/deployment or create a second dedicated bridge-relay repository.

## Handoff Status

No application has been scaffolded. Start by selecting the bridge relay deployment boundary, then create the independent database schema and digital-only Telegram sales MVP.

## Production Operations Memory

The active Telegram bot and public website use the Azure production stack behind:

```text
https://70-153-137-10.sslip.io
```

Operational rules for future sessions:

- A user request to "apply", "update", or "deploy" means update the Azure production stack, not only the local Docker Compose stack.
- Local Docker at `localhost:3000` is for build and verification; updating it alone does not update the Telegram bot webhook.
- Production Compose is stored at `/opt/telegram-store/docker-compose.yml` on the Azure VM.
- Build the application image locally, transfer/load it as `telegram-app:production`, then recreate only the production `app` service when no schema migration is required.
- Preserve the production PostgreSQL volume. Never run a fresh migration, database reset, or volume recreation.
- Verify both the internal container health and `https://70-153-137-10.sslip.io/api/health` after deployment.
- Confirm the production image contains the expected new behavior instead of relying only on local build output.
- Telegram messages already sent to a chat keep their old text and buttons visually. They are not rewritten by a deployment, although their callback data is processed by the currently deployed webhook handler.

### Production VM Access

Use the existing SSH key instead of relying on a remembered VM password:

```text
Host     : 70.153.137.10
User     : azureuser
SSH key  : %USERPROFILE%\.ssh\telegram-store-azure
App path : /opt/telegram-store
```

Operational notes:

- Connect as `azureuser`; direct `root` key authentication may be rejected.
- `azureuser` has non-interactive `sudo` access for the production Docker workflow.
- Keep any VM password in a password manager or Windows Credential Manager, never in this repository, project documentation, chat output, or source files.
- Before deployment, create and verify a PostgreSQL backup and preserve rollback image tags.
- Apply schema changes only with `prisma migrate deploy`. Never run reset/fresh migrations or recreate the PostgreSQL volume.

### Production Incident: Admin Login Origin Failure (2026-08-22)

Observed symptom:

```text
Browser stopped at /api/admin/login and displayed {"ok":false}.
```

This was an application bug, not an incorrect or forgotten admin password. The rejected request carried `Origin: null`, so strict CSRF origin validation stopped the request before password verification. The admin response header `Referrer-Policy: no-referrer` was incompatible with the native login form flow in the affected Chrome request.

Production fix:

- Admin pages now use `Referrer-Policy: same-origin` so same-origin login metadata is preserved without leaking the admin URL to external origins.
- Strict origin validation remains enabled; `Origin: null` is not trusted or accepted.
- A rejected login origin now redirects to `/admin/login?error=origin` instead of exposing raw JSON in the browser.
- A direct `GET /api/admin/login` now redirects to `/admin/login`.
- Regression tests cover both the login-route redirects and the admin referrer policy.

Required production checks after future authentication or header changes:

```text
GET  /admin/login     -> 200 with Referrer-Policy: same-origin
GET  /api/admin/login -> 307 redirect to /admin/login
POST /api/admin/login with rejected origin -> 303 redirect to /admin/login?error=origin
POST /api/admin/login with valid origin and invalid credentials -> 303 redirect to /admin/login?error=invalid
```

Do not weaken `assertAdminOrigin` to accept missing or null origins as a workaround. Fix the page/header/form flow while keeping CSRF protection intact.

### Admin Payment Switches and HTTP 401 Stock Policy (2026-08-22)

Admin payment availability is managed from:

```text
/admin/payment-settings
```

The page controls QRIS/DANA, wallet checkout, wallet + QRIS, wallet top-up, Bank Jago, Binance Pay, and USDT BEP20. Disabled methods are hidden from new Telegram checkout choices and rejected by backend guards. Existing invoices are not cancelled by a later toggle change.

Payment dependencies:

- Wallet + QRIS requires both wallet checkout and QRIS/DANA.
- Wallet top-up requires wallet checkout and at least one ready Rupiah provider: QRIS/DANA or Bank Jago.
- Bank Jago, Binance Pay, and USDT BEP20 can be enabled only after their provider configuration is ready.

Wallet top-up provider behavior:

- Existing top-up rows remain `DANA_RELAY`; migration `20260822170000_add_jago_wallet_topup` is additive and does not reset or rewrite transactional data.
- New Bank Jago top-ups store a provider snapshot and immutable destination-account snapshot in `JagoWalletTopupAttempt`.
- Bank Jago top-ups never create or register a DANA relay claim. DANA and Jago events are matched only to their own provider, exact amount, and payment window.
- Telegram asks for a provider when both are ready, or goes directly to amount selection when only one is ready.
- Pending Bank Jago invoices expose Telegram `copy_text` buttons for the raw account number and raw exact amount; order invoices use the same copy behavior.
- Wallet top-up tables in admin show and search the payment provider so reconciliation is visible to the operator.

Production deployment on 2026-08-22:

- Backup: `/opt/telegram-store/backups/pre-jago-wallet-topup-20260822T032732Z.dump`
- Rollback images: `telegram-app:rollback-jago-topup-20260822` and `telegram-migrate:rollback-jago-topup-20260822`
- Applied migration: `20260822170000_add_jago_wallet_topup`

Product-level HTTP 401 behavior is configured inside each product edit page under `Aturan stok banned`:

```text
BLOCKED          : HTTP 401/402 cannot be sold.
ALLOW_HTTP_401   : only detected HTTP 401 stock is automatically sellable.
OWNER_APPROVAL   : individual HTTP 401/402 stock requires explicit owner approval.
RELOGIN_REQUIRED : stock must be edited/relogged and checked healthy before sale.
```

Safety invariants:

- `ALLOW_HTTP_401` never makes HTTP 402 sellable.
- Delivered, reserved, archived, or otherwise referenced stock is never recycled as new stock.
- Checkout, payment confirmation, preorder allocation, manual stock assignment, refund restoration, cancellation, and expiry use the shared sellability predicate.
- Changing the product policy normalizes existing unallocated banned stock under the inventory allocation lock and then attempts FIFO allocation for paid preorders.
- The default remains `BLOCKED`; deployment does not automatically enable HTTP 401 sales for existing products.

### Compact Architecture and Jago Recovery Update (2026-08-22)

The canonical fast-start architecture/VPS map now lives in `PROJECT_COMPACT.md`.
Future sessions must read that file before recursively searching the repository.

Current Jago notification handling accepts these incoming formats:

```text
<NAME> telah mengirim Rp17.573 ke kamu
Kamu menerima kiriman Rp35.098 dari <NAME>
Kamu menerima Rp10.565 dari GoPay
```

Outgoing notifications such as `Kamu telah membayar Rp22.000 ke ...` are
explicitly ignored and covered by regression tests.

Recovery behavior:

- Expired DANA and Jago payments can be credited to wallet without the unique
  code; the expired product is not delivered.
- A still-pending Jago payment missed by the bridge has an explicit audited
  admin confirmation path with a confirmation modal.
- QRIS/DANA and Jago matching are provider-isolated. Final billed amounts are
  also globally unique while active; any same-provider ambiguity fails closed.
- `/admin/redeem` supports native drag-and-drop TXT upload. Dropped files are
  synchronized into the hidden multipart input with `DataTransfer`.

Production backup before this patch:

```text
/opt/telegram-store/backups/pre-jago-notification-recovery-20260822T060327Z.dump
```

Rollback image:

```text
telegram-app:rollback-jago-notification-recovery-20260822
```

### Android Jago Receiver-First Notification Fix (2026-08-22)

Production diagnostics confirmed Android bridge `1.5.4` was healthy but never
sent the newer Jago formats because its local classifier only accepted
`<pengirim> telah mengirim Rp... ke kamu`. The server parser was already ready.

Android bridge `1.5.5` (`versionCode 18`) now also forwards:

```text
Kamu menerima kiriman Rp35.098 dari <pengirim>
Kamu menerima Rp10.565 dari GoPay
```

Outgoing `Kamu telah membayar ...`, outgoing transfers, refunds, cashback, and
promotions remain ignored. Unit tests cover all three accepted incoming formats
and the outgoing/noise regressions. At the time of this incident the built
artifact at `deploy/K12-Stockroom-Bridge.apk` was version 1.5.5. That path now
contains the newer 1.5.7 artifact documented below. This Android-only Jago fix
did not require a server redeployment or database migration.

### Reusable Payment Recovery and Admin Page Split (2026-08-23)

Manual payment recovery no longer belongs only to the dashboard recent-order
table. One shared policy now drives approval/recovery actions on the dashboard,
order list, order detail, Bank Jago ledger, wallet page, and wallet-top-up table.

Safety behavior:

- Active `DANA_RELAY`, `WALLET_QRIS`, and `JAGO_TRANSFER` invoices can use the
  audited admin approval command.
- An expired timestamp still marked pending is not approvable; the expiry worker
  must finalize it before wallet-only late-payment recovery is offered.
- Binance Pay and USDT BEP20 stay verifier-only.
- Jago product orders are supported by event reconciliation with strict package,
  provider, amount, time-window, target, and idempotency checks.
- Wallet-top-up manual confirmation requires an explicit authenticated admin
  override instead of accepting arbitrary internal callers.

Admin payment UI is split into dedicated routes documented in
`PROJECT_COMPACT.md`. Provider edit forms, provider ledgers, and event
reconciliation must not be recombined into one monolithic page.

Production deployment:

```text
Date          : 2026-08-23
Schema change : none
Backup        : /opt/telegram-store/backups/pre-payment-recovery-refactor-20260823T005209Z.dump
Rollback      : telegram-app:rollback-payment-recovery-refactor-20260823
App image     : sha256:610836a6093a0bc2613484a40f5ad7ee0cd499d43dcbf3e590e998291de9df5f
```

Only the `app` container was recreated. PostgreSQL, its persistent volume,
scheduler, notification worker, and Caddy were preserved.

### Multi-merchant QRIS Preparation (2026-08-23)

The QRIS flow is prepared for more than one merchant without sharing payment
state with another store and without rewriting existing production rows.

New admin routes:

```text
/admin/payment-settings/qris
/admin/payment-settings/qris/new
/admin/payment-settings/qris/[id]
/admin/payments/qris
```

Data model and security behavior:

- `QrisMerchant` stores one merchant identity, code-owned provider key, active
  state, audit fields, encrypted static EMV QRIS payload, and safe SHA-256
  fingerprint.
- `QrisInvoiceAttempt` stores exactly one immutable order or wallet-top-up
  snapshot: merchant, provider, allowed Android packages, allowed bridge device
  IDs, encrypted payload, amount, expiry, status, and matched bridge event.
- Migration `20260823120000_add_qris_merchants` is additive. It does not reset,
  delete, or backfill existing order/payment/top-up data.
- Static QRIS validation requires a valid TLV structure and CRC, static point of
  initiation (`01=11`), and no fixed amount tag. Invoice rendering changes the
  mode to dynamic (`01=12`), inserts tag `54`, and recalculates CRC.
- Only one ready merchant can be selected for new checkout. Switching merchant
  never changes an already-created invoice.
- Existing payment rows without a QRIS snapshot remain DANA-only legacy rows.
  The existing env payload is a compatibility fallback only until the first
  database merchant is created. After that, no active database merchant means
  QRIS is unavailable; archive/disable never reactivates the env QR silently.
- A database merchant can store one exact `trustedDeviceId`. Android matching
  requires provider, package, and device snapshots together. DANA profiles with
  no device are relay-only. Legacy env mode can explicitly opt into trusted
  devices through `DANA_ANDROID_BRIDGE_DEVICE_IDS`; blank remains relay-only.
- New DANA snapshots can use the neutral DANA relay. Shopee Partner snapshots
  use their own trusted Android package and trusted bridge device, and never
  register a DANA relay claim.
- QR rendering is shared by product checkout and wallet top-up. A snapshotted
  invoice never silently falls back to a different global QR image.
- Payment matching and reconciliation validate provider/package/device
  snapshots, exact amount, original time window, event ownership, and
  idempotent attempt state. Legacy fallback is permitted only for DANA.

Shopee Partner readiness:

- ADB verified the installed application label `Shopee Partner`, package
  `com.shopeepay.merchant.id`, version 3.61.1, and the exact notification:
  `Pembayaran sebesar Rp... telah diterima pada transaksi ...`.
- The server and Android bridge now use one exact code-owned provider adapter.
  Similar packages cannot inherit trust, and the parser accepts only the
  verified incoming-payment wording. Group summaries and unrelated Shopee
  notifications remain ignored.
- Shopee Partner never registers a DANA relay claim. Auto matching and manual
  reconciliation both require provider, exact package, exact bridge device ID,
  immutable invoice snapshot, exact amount, payment window, and one unclaimed
  target.
- The final local bridge artifact is 1.5.7 (`versionCode 20`) at
  `deploy/K12-Stockroom-Bridge.apk`, SHA-256
  `EEEF2AD4D34C2B12BF433757B776C3DB74B942100283FED20A3AA8780F71D55D`.
  The phone was last verified on 1.5.5 (`versionCode 18`). ADB was disconnected
  before installation, so the final APK and preserved bridge device ID still
  need to be applied to the merchant configuration later.

Local validation completed without touching the real database:

```text
Tests             : 376 passed, 28 skipped
TypeScript        : passed
ESLint            : passed
Prisma validate   : passed
Android unit test : passed with Android Studio JBR
Next.js build     : passed locally (WASM fallback used for the broken native SWC)
Android APK build : passed for version 1.5.7
Docker app build  : passed during the original multi-QRIS preparation
Docker migrate    : passed during the original multi-QRIS preparation
PostgreSQL test   : all 33 migrations applied on an isolated PostgreSQL 17
```

The native SWC binary still reports `not a valid Win32 application`, but Next.js
successfully completed the production build through its WASM fallback.

Production deployment on 2026-08-23:

```text
Migration     : 20260823120000_add_qris_merchants
Backup        : /opt/telegram-store/backups/pre-multi-qris-20260823T111350Z.dump
Backup SHA256 : 14f2608e94a3045356350b63026cb067f585617190bd9e879644087f28aee937
App rollback  : telegram-app:rollback-multi-qris-20260823T111350Z
Migrate roll. : telegram-migrate:rollback-multi-qris-20260823T111350Z
App image     : sha256:78bcc88086468915e6094ec968e9b32ad432d5a2723a233ba5b9ef51d6dc0055
Migrate image : sha256:fbb05cd8a42ee503788ede4304f8bf21e63dd3ff88104b769783ad1f190ad9e7
```

Before production, the QRIS migration was wrapped with explicit `BEGIN` and
`COMMIT`, then all 33 migrations were applied successfully to a disposable
PostgreSQL 17 database. Production migration status is up to date. Only the app
container was recreated; PostgreSQL, its volume, scheduler, notification
worker, and Caddy remained running. Public health returned database `ready`.

The payment-settings UI now separates central method switches from provider
configuration. A prominent `QRIS untuk invoice baru` panel links directly to
merchant management, merchant creation, and the QRIS ledger. Production still
uses the legacy DANA environment fallback until the first database merchant is
created; no QRIS payload or merchant record was created automatically during
deployment.

### Explicit Legacy QRIS Control Prepared Locally (2026-08-23)

The legacy DANA environment QRIS is no longer modeled as a hidden fallback.
Local code now exposes it on `/admin/payment-settings/qris` with confirmation
actions to select it, disable it, or import it into the encrypted database
vault. The UI shows only validity, device count, and a shortened fingerprint;
the payload remains secret.

Routing rules:

- An active database merchant always wins.
- The env QRIS is used only when `legacyQrisFallbackEnabled` is explicitly true
  and no active database merchant exists.
- Selecting the env QRIS deactivates the active database merchant under the
  shared QRIS advisory lock.
- Activating or atomically creating an active database merchant disables the
  env fallback in the same transaction.
- Importing the env QRIS validates and encrypts the payload, activates the
  imported DANA merchant, and disables the env fallback atomically.
- Disabling the env QRIS never changes existing immutable invoice snapshots.

Migration `20260823141000_add_legacy_qris_fallback_control` is additive and
wrapped in `BEGIN/COMMIT`. At the time this preparation section was written it
had not yet been applied to production. All 34 migrations were applied
successfully to disposable PostgreSQL 17; the full local suite passed with 392
tests, typecheck, lint, Prisma validation, and a production Next.js build.

### DANA/Shopee QRIS Selector and Shared Device UX (2026-08-23)

Local admin UX now separates the summary from the financial mutation surface:

- `/admin/payment-settings` shows whether new invoices use DANA or ShopeePay
  and links to the dedicated selector.
- `/admin/payment-settings/qris` presents legacy DANA, DANA vault merchants,
  and ShopeePay merchants as explicit source cards. Existing activation routes,
  confirmation modals, advisory lock, and invoice snapshots remain the only
  routing mutation path.
- The create links preselect DANA or ShopeePay and supply safe default internal
  names/slugs, so the operator normally uploads one image and confirms.

One Android phone keeps one generated bridge Device ID. The QRIS form reads up
to 20 recent `BridgeDeviceStatus` heartbeats, selects the newest compatible
device automatically for Shopee, and permits the same ID on DANA and Shopee
merchant records. Package snapshots still distinguish `id.dana`/
`id.dana.kasir` from `com.shopeepay.merchant.id`.

Shopee activation is fail-closed in shared backend policy. Drafts may be saved,
but create-and-activate, activating an existing merchant, and editing a still
active merchant require the exact Device ID to exist as an Android heartbeat
with bridge version `1.5.7` / version code `20` or newer. The selector, detail
page, form, and backend use the same policy and expose distinct operator errors
for unknown devices, missing version reports, and outdated bridge builds.

QRIS image decoding now preserves internal spaces because EMV TLV lengths and
CRC include them. It tries the full image first, then a center-square crop for
poster-style QRIS artwork, and recognizes the exact Shopee merchant-account
identifier without guessing from the visible merchant name. This change is
now deployed together with the additive legacy-control migration. Production
shows the DANA/Shopee selector and reports a compatible bridge `1.5.7`
heartbeat. Creating and activating the actual Shopee merchant remains an
explicit financial admin action; deployment did not upload a QRIS payload.

Production deployment record:

```text
Migration      : 20260823141000_add_legacy_qris_fallback_control
Backup         : /opt/telegram-store/backups/pre-qris-shopee-selector-20260823T135402Z.dump
Backup SHA-256 : 4b7a93dcbb574f255a547fcf493224346e664cb7f0bf0f8ae22aa98e2cfcd2ff
App image      : sha256:3d03ebda23c17718ee0e220c39372ede1cf0e0cb7d7ca4d3b9ff081754ab0f3c
Migrate image  : sha256:1aeed79bbef339cf4b489bc37072b9acdf25c7c44dbda093f41caadfc79258cf
```

Only the `app` service was recreated. PostgreSQL, its volume, scheduler,
notification worker, and Caddy stayed running.

### Product Groups and Variants Deployed (2026-08-24)

The catalog now supports reusable one-level parent groups without moving stock
or changing the sellable SKU model:

```text
ChatGPT (ProductGroup, not sellable)
  -> K12 JSON (Product)
  -> Team (Product)
  -> Codex Free (Product)
```

Implementation behavior:

- `ProductGroup` owns parent name, description, image, status, and catalog
  order. `Product` keeps price, stock, preorder, attachment, banned policy, and
  fulfillment.
- Existing products remain standalone through nullable `Product.groupId`.
- New order items snapshot the parent ID/name and variant label.
- Parent and variant labels have case/whitespace-insensitive unique indexes.
- Inactive parents fail closed across Telegram catalog/detail/quantity/payment,
  checkout, and public product broadcasts.
- Telegram keeps legacy `product:<id>` callbacks and old numbered catalog
  session payloads compatible, while adding `group:<id>` and paginated
  `group_page:<id>:<page>` callbacks.
- Admin routes are split under `/admin/product-groups`, `/new`, and
  `/[id]/edit`; products can be assigned, reordered, searched, filtered, and
  created directly as a variant from the parent page.
- Stock is never moved when grouping or regrouping a product.

Migration `20260824100000_add_product_groups` is additive and transactional. It
was first applied with all 35 migrations to disposable PostgreSQL 17. Default
tests, typecheck, lint, Prisma validation, production build, ProductGroup DB
tests, preorder allocation tests, and the isolated 100-operation concurrency
suite passed before production deployment.

Production deployment record:

```text
Date            : 2026-08-24
Migration       : 20260824100000_add_product_groups
Backup          : /opt/telegram-store/backups/pre-product-groups-20260824T064625Z.dump
Backup bytes    : 32728918
Backup SHA-256  : 174352734ad70a22b083fd599d50b8fcc70a831d6109445f23cf20b6ce873720
App rollback    : telegram-app:rollback-product-groups-20260824T064625Z
Migrate rollback: telegram-migrate:rollback-product-groups-20260824T064625Z
App image       : sha256:4b1d2386a43172a05802789ab8681c42a62433f8d839534d0a74277323d01dcf
Migrate image   : sha256:945a774393238b411f4893a52d31a6736ddfedcb6faabc6bc55eb3355d512ce6
```

The catalog backfill ran inside one validated PostgreSQL transaction. It
created four active groups and assigned 25 exact existing products: ChatGPT
(19), Claude API (2), Multi-AI API Key (2), and AI Token Packages (2). Five
products remain standalone. The SQL referenced only `ProductGroup` and the
Product grouping fields; it did not update wallet, payment, order, or stock
tables. Only the `app` service was recreated, while PostgreSQL, its persistent
volume, scheduler, notification worker, and Caddy remained running. Production
health returned database `ready`, the new admin routes redirected correctly to
login without a session, and a second `prisma migrate deploy` reported no
pending migrations.

### Automated Telegram Re-engagement Prepared Locally (2026-08-24)

The bot now has a bounded, idempotent win-back flow for two audiences:

```text
Existing buyer  -> no successful purchase or inbound interaction for N days
Never-buyer     -> no inbound interaction for N days and no successful purchase
```

Behavior and safety:

- The owner explicitly requested that the campaign target all reachable bot
  users, including users who never purchased and users who disabled product
  announcements. `broadcastEnabled` is therefore not an eligibility filter.
- Permanent Telegram 400/403 recipient failures set a separate
  `telegramReachable=false` suppression. A new inbound user update restores it.
- Buyer detection uses paid, non-refunded product orders and completed SMS
  orders. Active orders, wallet top-ups, SMS orders, recent chat activity, and
  pending operational Telegram notifications prevent queueing.
- Scheduler fanout uses a PostgreSQL advisory lock, bounded scan/batch, session
  compare-and-update claim, deterministic dedupe key, cooldown, and per-episode
  maximum. The existing Telegram outbox worker performs retry and delivery.
- Reminder priority is 140, below payment success, digital delivery, refunds,
  OTP, stock events, attachments, and admin broadcasts.
- The worker reloads settings immediately before send, so disabling the feature
  stops already-queued reminders from being sent.
- Existing `BotSession` rows receive `lastInboundAt=CURRENT_TIMESTAMP` during
  migration. Combined with `reengagementEnabled=false`, deployment alone cannot
  immediately blast historical users.

Default configuration:

```text
Enabled                  : false
Buyer inactivity         : 30 days
Never-buyer inactivity   : 7 days
Cooldown                 : 14 days
Maximum per inactive run : 3 messages
Batch                     : 50 recipients
Scheduler                 : every 30 minutes
```

Admin routes:

```text
/admin/broadcasts/reengagement
/admin/broadcasts/reengagement/history
```

Both buyer and never-buyer templates are editable. Settings changes require a
confirmation modal and explicit acknowledgement of the broad audience. The UI
disables actions while processing and provides a confirmed manual `run now`
action plus a searchable/paginated outbox ledger.

Migration `20260824113000_add_reengagement_settings` is additive and has not
been applied to production. It was validated by applying all 36 migrations to
a disposable PostgreSQL 17 database. A database integration test confirmed
that an eligible user with `broadcastEnabled=false` is queued, while recent,
unreachable, and active-order users are skipped, and a second overlapping run
does not duplicate the notification.

Validation:

```text
Tests (default) : 420 passed, 31 skipped
DB integration  : 1 passed
TypeScript      : passed
ESLint          : passed
Prisma validate : passed
Next.js build   : passed
Docker app      : sha256:b7f1fed28d46aed1ec1bfcb81fb22883c8a4f1606a4dae934fc2ee1651692587
Docker migrator : sha256:ae2fb1cffb856b7f947ede841421fc7971800d8eba3e8834a2eaf0cebc9cfacb
Migration SHA   : aea3be298442d1b2f4494a0da27b8c156a2c570a2c0fa509a0f8ace5c2840bac
```

Production, its database, wallet, orders, payments, stock, and running services
were not changed for this feature preparation.

### Telegram Product Custom Emoji Prepared Locally (2026-08-25)

Telegram product presentation now supports configurable Premium custom emoji
without changing the existing message layout. The supported automatic brand
families are:

```text
ChatGPT/OpenAI/GPT/Codex -> ChatGPT custom emoji
Claude/Anthropic         -> Claude custom emoji
```

An administrator configures the IDs from the bot itself by sending the actual
Premium custom emoji, not a Unicode emoji or image:

```text
/setemoji chatgpt <custom emoji>
/setemoji claude <custom emoji>
```

The bot extracts `custom_emoji_id` from Telegram message entities and stores it
in `StoreRuntimeSetting` with actor/time audit fields. The integration covers
catalog and search results, product groups and variants, product details,
quantity selection and validation, maintenance responses, stock/restock/sold
out announcements, purchase buttons, product attachments, and individual or
grouped delivery captions. A text containing both supported brands receives
both entities; a Telegram inline button uses the first configured brand in its
display text because a button accepts one leading custom icon.

All messages retain readable Unicode fallback icons. Telegram API calls retry
once without custom emoji entities/button icons only when Telegram returns a
matching permanent HTTP 400 custom-emoji rejection. This prevents an invalid,
deleted, or temporarily ineligible custom emoji from blocking catalog or file
delivery.

Migration `20260825100000_add_telegram_custom_emoji_settings` is additive,
transactional, and local-only. It adds nullable custom emoji and audit fields
with digit-only database checks. It does not change product, stock, wallet,
payment, order, or delivery records. Production and its database were not
changed.

Validation:

```text
Tests (default) : 442 passed, 31 skipped
TypeScript      : passed
ESLint          : passed
Prisma validate : passed
Next.js build   : passed through the existing WASM SWC fallback
PostgreSQL test : all 37 migrations applied on disposable PostgreSQL 17
```

### Product Media, Post-delivery Guidance, and Security Hardening (2026-08-29)

Product operators can now configure optional instructions and an HTTPS redeem
URL on each product create/edit form. Once Telegram accepts all purchased
credential files, the worker sends the optional encrypted product attachment,
then one post-delivery guide per distinct product, then releases the public
success-channel notification. Dedupe is stable on order and product IDs, so an
order containing 20 units of one CDK product gets one guide rather than 20.

Migration `20260829100000_add_product_post_delivery_instructions` is additive,
transactional, and local-only. It adds two nullable Product columns with
database length/HTTPS checks and does not rewrite existing transactional data.
Production authorization was not given for this exact migration, so no
production migration or deployment occurred.

Product image uploads were already stored as validated Base64 data URLs, but
the active/inactive product tables did not render them. Admin lists now use a
small authenticated image endpoint and live upload preview, while product list
queries avoid loading the full Base64 image and encrypted attachment payloads.

The source-backed security review found that decrypted stock content used to be
rendered automatically on inventory and order pages. Sensitive content is now
hidden until the admin explicitly selects `Tampilkan isi`, and links into these
surfaces disable Next.js prefetch. Admin session tokens also contain a version
derived from `ADMIN_PASSWORD_HASH`, so changing the configured password hash
invalidates existing sessions. Sensitive file/image GET endpoints return HTTP
401 for a missing admin session rather than surfacing an unhandled 500.

Digital credential and attachment uploads now treat both a missing Telegram
response and a Telegram gateway 5xx as an ambiguous outcome. They move to
manual review instead of automatic retry, preserving the invariant that the
same credential must never be sent twice. Definite rate limits remain safely
retryable.

The strongest plausible compromise path remains plaintext credential exposure
inside an authenticated browser page to a browser extension with broad page
access. This is a capability/risk finding, not attribution to any specific
extension or proof of theft. Operators should use a clean admin-only browser
profile and rotate admin authentication secrets after incident review. Do not
rotate `DIGITAL_STOCK_ENCRYPTION_KEY` without a complete re-encryption plan.

The Codex Security hosted Standard-scan launcher did not successfully register
a scan in this session, so no official sealed scan report was claimed. Manual
source review and regression validation completed locally. Docker Desktop and
local PostgreSQL were unavailable, so the new migration still needs validation
against an isolated disposable PostgreSQL 17 database before any production
authorization or deployment.

Local validation:

```text
Tests           : 468 passed, 31 skipped
TypeScript      : passed
ESLint          : passed
Prisma validate : passed
Next.js build   : passed through the existing WASM SWC fallback
Production DB   : untouched
```

### Telegram Formatter and Public-channel Hardening Deployed (2026-08-30)

The formatter, product post-delivery guidance, product media/security fixes,
and Telegram recipient hardening are active in Azure production.

Additional safety changes made immediately before deployment:

- Customer notification kinds fail closed when their destination is not a
  positive numeric private Telegram chat ID. Digital delivery also binds every
  grouped row and the final destination to the owning order chat.
- Product attachments, post-delivery instructions, direct admin order
  messages, and SMS OTP delivery verify the notification recipient against the
  corresponding order owner before sending.
- Public success-channel delivery ignores stored arbitrary message content and
  reconstructs the message from referenced order/SMS data. Buyer identity is
  masked, labels are bounded/sanitized, and unknown success-channel rows enter
  manual review. Files, credentials, OTP values, access tokens, customer
  instructions, and internal errors are not eligible for that channel.
- Rich-text entity validation rejects UTF-16 offsets that split an emoji
  surrogate pair.

Validation before production:

```text
Default tests       : 485 passed, 31 skipped
TypeScript          : passed
ESLint              : passed
Prisma validate     : passed
Next.js build       : passed
PostgreSQL 17       : all 39 migrations applied from zero in a disposable DB
Candidate smoke     : migrator passed and app became healthy on the disposable DB
Production DB reset : never used
```

Production procedure:

1. Enabled global checkout maintenance.
2. Stopped scheduler and notification worker.
3. Created and verified a PostgreSQL custom-format backup.
4. Tagged both prior production images for rollback.
5. Loaded checksum-verified candidate images.
6. Ran only `prisma migrate deploy`.
7. Recreated only the app service, then verified health and migration status.
8. Restarted scheduler/notification worker and audited new notification states.
9. Disabled maintenance after the audit reported no new pending, processing,
   failed, or manual-review notification rows during the deployment window.

Production records:

```text
Applied migrations : 20260829100000_add_product_post_delivery_instructions
                     20260830100000_add_telegram_rich_text_entities
Backup              : /opt/telegram-store/backups/pre-telegram-formatter-20260830T040822Z.dump
Backup SHA-256      : 39a1993fc3445c673e277a4a6c5ff9eb2b6bad8d758daee70e5b97b6f018089f
App rollback tag    : telegram-app:rollback-telegram-formatter-20260830T040822Z
Migrator rollback   : telegram-migrate:rollback-telegram-formatter-20260830T040822Z
App image           : sha256:3214982d67c00eb0a169676be4e18b6693f29fb01a24f6d887fe5731a0e4b9bb
Migrator image      : sha256:d89aead3fb9fb2e643cade94470ddd44c07382287767c5c3f9abc35a0d2818ef
Migration status    : all 39 migrations up to date
Public health       : database ready
Maintenance         : disabled after verification
```

After verifying the current production and formatter rollback image IDs,
obsolete candidate tags and dangling layers were pruned. The active and latest
rollback tags remain available, while root-disk usage dropped from 96% to 84%.

The production server already had the re-engagement and custom-emoji
migrations even though the earlier compact note still listed them as pending.
No wallet, payment, order, stock, delivery, customer values, or PostgreSQL
volume were reset, deleted, reseeded, or recreated.

### Admin Telegram Rich-text Formatter Implementation Detail (Pre-deploy, 2026-08-30)

The admin website now has one reusable rich-text editor for product
post-delivery instructions, admin broadcasts, and direct messages from an order
detail page. Supported controls are bold, italic, underline, strikethrough,
spoiler, inline code, HTTPS link, blockquote, unordered/ordered list, and clear
format. The editor shows a live Telegram-style preview, preserves template
buttons on direct order messages, disables financial/communication actions
while submitting, and uses an explicit link modal rather than browser alerts.

The implementation follows the official Telegram Bot API formatting contract:
message entities use UTF-16 code-unit offsets. The website does not send or
store arbitrary contenteditable HTML and does not depend on raw MarkdownV2
escaping. It submits plain text plus entity JSON; the server validates the
allowed type, integer range, containment rules, code exclusivity, blockquote
rules, maximum entity count, and HTTPS link safety before storing or queueing.

Product and broadcast entity arrays are stored by additive migration
`20260830100000_add_telegram_rich_text_entities`. Direct order messages use a
versioned snapshot inside the existing encrypted/controlled Telegram outbox
payload field, and the worker can still read legacy plain-text admin messages.
During this implementation stage, no production database operation or
deployment occurred. The local admin pages
could not be interactively opened in the browser because the active Chrome
session was not signed in to localhost; source tests and the complete Next.js
production build still validated the component and route graph.

Validation:

```text
Tests           : 479 passed, 31 skipped
TypeScript      : passed
ESLint          : passed
Prisma validate : passed
Next.js build   : passed through the existing WASM SWC fallback
PostgreSQL test : not run; Docker Desktop/local PostgreSQL was unavailable
Production DB   : untouched
```

### Catalog Rich Text and Product Workspace UX Deployed (2026-08-30)

Public Product and ProductGroup descriptions now use the same validated
Telegram rich-text document model as the existing formatter: readable plain
text plus bounded `MessageEntity` JSON. Arbitrary HTML and raw MarkdownV2 are
not stored or sent. Migration
`20260830130000_add_catalog_description_entities` adds only
`Product.descriptionEntities` and `ProductGroup.descriptionEntities`, both as
non-null JSONB arrays with `[]` defaults and a maximum of 100 entries. Existing
descriptions and every wallet, payment, order, stock, credential, delivery, and
customer row were left unchanged.

The website now uses one reusable public catalog description component for
product create/edit and product-group create/edit. The base editor has explicit
`Publik`, `Privat pembeli`, and admin audiences; a compact `Tulis | Preview`
switch; responsive wrapping toolbar; selection preservation for mouse and
keyboard commands; safe HTTPS link modal; strict maximum-length recovery; and
last-valid-document restoration instead of silently deleting all formatting.

The dedicated product workspace was redesigned around the actual operator
workflow. The page title is compact, the product form owns the wide column,
stock upload is a smaller sticky rail, and reusable sections separate public
catalog information, group/variant placement, product media, private
post-delivery instructions, and preorder. Banned recovery and the danger zone
remain separate below the main form.

Telegram product detail, group variant, and product-created announcement
messages no longer strip catalog formatting. Each path formats the header,
public description, and footer separately, truncates descriptions without
splitting UTF-16 emoji pairs, then composes the documents while shifting all
entity offsets. Custom emoji are inserted before composition. Private
post-delivery entities are not queried or accepted by these public builders.

An offset regression was fixed in both product parsers: Zod no longer trims the
description before rich entities are normalized. The rich-text normalizer now
trims the text and shifts entities atomically, so leading/trailing whitespace
cannot move a bold/link range onto the wrong characters.

Validation before production:

```text
Default tests       : 501 passed, 32 skipped
TypeScript          : passed
ESLint              : passed
Prisma validate     : passed
Next.js build       : passed
PostgreSQL 17       : all 40 migrations applied from zero in a disposable DB
Product DB tests    : 6 passed, including entity defaults/constraints and stock/payment concurrency
Candidate Docker    : migrator passed; app returned {"ok":true,"database":"ready"}
Production DB reset : never used
```

Production deployment records:

```text
Applied migration : 20260830130000_add_catalog_description_entities
Backup            : /opt/telegram-store/backups/pre-catalog-richtext-20260830T102300Z.dump
Backup bytes      : 39997044
Backup SHA-256    : 11db0ed63cdd0eb2e3f62eae791d1901583c06b006ad9c0be2f7d02293122d4d
App rollback      : telegram-app:rollback-catalog-richtext-20260830T102300Z
Migrator rollback : telegram-migrate:rollback-catalog-richtext-20260830T102300Z
App image         : sha256:890f32cd7b05001527615955d1beac4c2d085f68b41cdda3a8250070d9e75baf
Migrator image    : sha256:1e4370570105ff2e0dca068f3afc7fe982b1700a8d2282f93413af996d2c2f70
Migration status  : all 40 migrations up to date
Public health     : database ready
Maintenance       : disabled after final verification
```

The deployment enabled global maintenance before backup/migration, stopped the
scheduler and notification worker, loaded a checksum-matched image archive,
ran the additive migration, and recreated only the app. A plain worker start
left the scheduler with a stale Compose DNS attachment (`app` did not resolve),
so both stateless curl workers were recreated before checkout was reopened.
Afterward both workers stayed up without new DNS errors. The final monitoring
audit showed bridge queue 0, outbox pending 0, rejected payment events in the
last hour 0, and no failed/ambiguous delivery increase. The existing 82
manual-review notifications and 11 exhausted notification retries predate this
deployment and remained unchanged.

Authenticated browser QA was completed against production. Desktop layout
showed the wider main form and smaller stock rail; the toolbar had no horizontal
scrollbar. At a 390 x 844 viewport the document width stayed within the
viewport, both rich-editor toolbars wrapped (`scrollWidth == clientWidth`), and
the Preview tab hid the editor and rendered the formatted Telegram preview.

### Telegram Catalog/Order Incident and Hotfix (2026-08-30)

Shortly after the catalog-richtext deployment, customers reported that opening
a product or continuing toward purchase returned the generic Telegram bubble:

```text
Permintaan belum dapat diproses. Silakan coba lagi.
```

Public health, PostgreSQL, Caddy, and Telegram webhook delivery were healthy.
The affected webhook calls returned HTTP 200 because `handleCallback()` caught
the internal exception, rendered the generic bubble, and did not log or rethrow
the original error. The exact customer exception therefore cannot be recovered
from production logs. The failure was nevertheless reproduced from the source:

- the new product/group renderer called the strict rich-text normalizer on
  already-persisted descriptions;
- legacy multiline descriptions may contain CRLF line endings;
- PostgreSQL constrained entity metadata only as an array of at most 100
  entries, so malformed offsets could still be persisted/imported;
- either CRLF or an out-of-range entity caused catalog presentation to throw;
- the callback catch converted that throw to the exact public generic message.

Immediate containment:

1. Enabled global checkout maintenance.
2. Rolled the app back to the previous formatter image while leaving the
   additive 40th migration in place.
3. Verified a real `/start` Telegram webhook update returned HTTP 200 on the
   rollback image.
4. Kept maintenance active while implementing and validating the hotfix.

The hotfix separates strict admin writes from resilient public reads:

- `normalizeTelegramRichTextDocument()` canonicalizes CRLF and bare CR to LF
  before validating LF-based UTF-16 entity offsets. This matches how the
  contenteditable editor calculates offsets even when HTML form serialization
  turns textarea line endings into CRLF.
- `catalogDescriptionDocument()` still preserves valid rich formatting, but a
  malformed persisted document falls back to normalized, safely truncated
  plain text with no entities. One bad legacy value can no longer hide a
  product/category or block the order buttons.
- Admin product/group create and edit remain strict and reject invalid links,
  crossing ranges, broken emoji boundaries, and malformed entity data.
- The callback catch now writes a redacted structured log containing only the
  callback action family and `cleanError()` output. It does not log message
  text, chat IDs, credentials, tokens, stock payloads, or payment secrets.

Hotfix validation:

```text
Default tests       : 505 passed, 32 skipped
Focused regression  : 31 passed
TypeScript          : passed
ESLint              : passed
Prisma validate     : passed
Next.js build       : passed
PostgreSQL 17       : all 40 migrations applied from zero in a disposable DB
Candidate Docker    : app returned {"ok":true,"database":"ready"}
Production DB reset : never used
```

Production records:

```text
Hotfix backup      : /opt/telegram-store/backups/pre-order-hotfix-20260830T120500Z.dump
Backup bytes       : 40002324
Backup SHA-256     : e43216bc41891716327e65d98c6dde5bf08bf0e2786341ee2f1dd495be47622f
App rollback tag   : telegram-app:rollback-order-hotfix-20260830T120500Z
Rollback image     : sha256:3214982d67c00eb0a169676be4e18b6693f29fb01a24f6d887fe5731a0e4b9bb
Hotfix app image   : sha256:5c4b3ed275bf6e9dc25d8f244b529a54858d855134a914b7d4864c268faf5c30
Migrator image     : sha256:1e4370570105ff2e0dca068f3afc7fe982b1700a8d2282f93413af996d2c2f70
Migration status   : all 40 migrations up to date; no hotfix schema change
Maintenance        : disabled after final smoke and queue audit
```

Production verification used real authenticated Telegram webhook updates for
the admin chat. `/start`, the exact affected `product:<id>` callback, and the
corresponding `buy:<id>` quantity selector all returned HTTP 200. The new
callback logger recorded no error for those tests. The candidate product had
98 inventory files recorded, so the test exercised a real stocked product path
without creating an order or payment. Scheduler and notification worker were
recreated after the app change to renew their Compose network attachment and
then remained up without DNS/HTTP errors. Final checks showed public database
health ready, bridge queue 0, outbox pending 0, and checkout open. One unmatched
payment bridge event visible in the last-hour metric was received before the
hotfix, was not auto-confirmed, and remains safely queued for admin review.

### Admin Rich-editor Reset and Product Workspace Hotfix (2026-08-31)

Production exposed a browser-specific editor failure on the dedicated product
edit route: every `onInput` updated React state, then the component rerendered a
contenteditable carrying the original `dangerouslySetInnerHTML`. Chrome restored
the initial HTML, so newly typed or deleted text disappeared almost immediately.
The failure was reproduced against production without submitting the form.

The reusable editor now treats its contenteditable as uncontrolled after
initialization. A layout effect applies safe initial HTML once for each actual
plain-text/entity document signature. React state continues to drive the
character counter, hidden plain-text/entity inputs, and Telegram Preview, but it
does not rewrite the active editing DOM during normal input. Additional safety
fixes canonicalize CRLF before applying UTF-16 entity offsets, reject detached
saved selection ranges, rebuild the caret after an overlength rollback, and
disable formatter commands while Preview hides the editor.

The product workspace was reorganized without changing its APIs or database:

```text
Top operations grid
  -> banned-stock policy with confirmation modal
  -> product-specific stock upload and warehouse shortcut

Full-width product form
  -> public catalog information
  -> group/variant and media grid
  -> private buyer guidance
  -> preorder

Bottom danger zone
  -> stock check and safe product deletion/deactivation actions
```

At wide desktop sizes the safe edit sections use two columns; at 1120 px and
below they collapse to one column before the fixed sidebar can make fields too
narrow. The layout contains no nested forms: banned policy, stock upload, and
product update remain independent sibling mutations.

Validation and deployment:

```text
Default tests       : 511 passed, 32 skipped
Focused editor tests: 6 passed
TypeScript          : passed
ESLint              : passed
Prisma validate     : passed
Next.js build       : passed
Disposable PG 17    : all 40 migrations applied from zero
Candidate Docker    : returned {"ok":true,"database":"ready"}
Schema migration    : none
Production DB reset : never used
```

Production records:

```text
Backup              : /opt/telegram-store/backups/pre-editor-ux-hotfix-20260830T164644Z.dump
Backup bytes        : 40142496
Backup SHA-256      : e0ded4a2477cea823b30ef47b6c6700eb839c6300181ffcb2261890d1b507576
Rollback tag        : telegram-app:rollback-editor-ux-hotfix-20260830T164644Z
Rollback image      : sha256:5c4b3ed275bf6e9dc25d8f244b529a54858d855134a914b7d4864c268faf5c30
Production app      : sha256:097ef8401f3f1101d7837579de981a3547ae1cd891ea31888051cf8984793d2b
Migrator image      : sha256:1e4370570105ff2e0dca068f3afc7fe982b1700a8d2282f93413af996d2c2f70
```

Only the app and the two stateless curl workers were recreated. PostgreSQL,
its persistent volume, Caddy, and the production schema were preserved. Public
health returned database ready and all services remained running. The temporary
transfer archive was removed. An automated authenticated browser smoke could
not be completed after deployment because the browser-control session had
expired to `/admin/login`; the code-level interaction suite and Docker/runtime
checks passed, but that exact production UI check must not be claimed as done.

### Telegram Catalog Photos and Product Warehouse UX (2026-08-31)

The product image upload itself was working, but Telegram never selected or
consumed `Product.imageUrl`. Product and group detail flows were text-only, and
the product-announcement worker discarded the loaded image. Stored uploads are
Base64 data URLs, which Telegram cannot accept directly as a `photo` value.

The catalog presentation now has one reusable media path:

- active stored product/group images are served by read-only public catalog
  image routes with MIME/magic-byte validation and safe cache headers;
- inactive/missing/malformed media returns 404, while the existing admin image
  route stays authenticated;
- external image values are accepted only as credential-free HTTP(S) URLs;
- `sendPhoto` and `editMessageMedia` carry caption entities and inline buttons,
  including the existing custom-emoji fallback;
- product/group photo captions are bounded to Telegram's 1,024 UTF-16 limit;
- definite invalid-media responses fall back to the same text screen so the buy
  flow remains available, while ambiguous request outcomes are not resent;
- product media persists through detail, quantity/custom-quantity, and payment
  method selection even when stock is exhausted or the item becomes preorder;
- product-created announcements use the same photo/fallback behavior. Product
  edits do not automatically reannounce to every subscriber.

The product edit workspace was also simplified without changing stock policy or
storage behavior. Upload, stock count, and the warehouse shortcut now live in
one `Gudang produk` panel. Upload is the primary action; format/checker detail
is collapsible; banned HTTP 401/402 policy is an advanced collapsed control with
its current status visible. The duplicate warehouse action was removed and the
whole section collapses to one column on narrower screens.

No schema or migration was added. Local verification completed with 523 tests
passed / 32 skipped, 38 focused media/photo tests passed, TypeScript, ESLint,
Prisma validation, and the production Next.js build.

Production deployment was app-only. PostgreSQL and its persistent volume were
not recreated, migrated, reset, seeded, or directly modified. Scheduler and the
fast notification worker were stopped only for the app replacement, then
recreated after the candidate became healthy.

```text
Backup       : /opt/telegram-store/backups/pre-catalog-photo-ux-20260831T100841Z.dump
Backup bytes : 40,347,203
Backup SHA   : 3c0e7dd76810ab19ebc99eb6b785a36b4a31fe801a27bce6dee34a4044c333ea
Rollback tag : telegram-app:rollback-catalog-photo-ux-20260831T100841Z
Rollback ID  : sha256:097ef8401f3f1101d7837579de981a3547ae1cd891ea31888051cf8984793d2b
Production   : sha256:21d75f569cb5c11e38e2ff417e2484868c5ff6bd65f23a928a3293a385befb7e
Schema       : unchanged; 40 existing migrations
```

The real ChatGPT Business 1 Bulan image route returned HTTP 200 `image/webp`.
An admin-chat Telegram smoke sent the photo, edited the same media message into
quantity selection, then edited it again into payment-method selection without
a callback error. Production app/database health, scheduler, and notification
worker remained healthy. Temporary transfer archives were removed; the backup
and rollback image remain.

### Full Admin, Telegram Callback, and Delivery Follow-up Audit (2026-08-31)

The follow-up audit found and fixed several independent production risks:

- product variants did not inherit their parent image, and stock-zero behavior
  had no dedicated regression test;
- dashboard, wallet, payment, inventory, product, and warehouse mutations could
  discard the active sheet, search, filter, sort, page, or section anchor;
- preset quantity callbacks and payment selection could lose the exact catalog
  search/group page used to open the product;
- the Bank Jago wallet back action could delete the only invoice bubble;
- SMS search sort callbacks could discard the country query, while bulk cancel
  counted PROCESSING rows that were not actually cancellable;
- inline formatting and list actions still depended on deprecated browser
  commands and could silently fail or move the caret;
- persisted malformed guide entities could roll back the critical transaction
  after Telegram accepted a credential file, and a retrying attachment could
  be overtaken by the guide;
- invalid AES-GCM metadata reached Node crypto before length validation.

The delivery worker now commits each credential receipt and queues one
idempotent `ORDER_DELIVERY_FOLLOWUP` row. That stage runs only for the matching
private owner after the order and provider payment are PAID, all stock is
assigned, and all credential receipts are SENT. It then fans out notifications
with explicit ordering:

```text
credential receipts -> product attachment -> private buyer guide -> success channel
```

The final credential commit also performs an eager, idempotent fan-out of the
attachment and guide rows after the commit, with the follow-up row retained as a
crash-recovery fallback. Their priorities are ahead of public catalog broadcasts
so a busy broadcast outbox does not delay private buyer guidance.

Legacy guide entity metadata falls back to the same immutable plain text; an
unsafe stored redeem URL is omitted. Definite pre-send snapshot failures may be
recovered, but ambiguous Telegram outcomes are never retried automatically.
The new global notification issue ledger exposes safe metadata and bounded
errors without selecting private `messageText` content.

The rich editor no longer uses `document.execCommand`. Bold, italic, underline,
strike, spoiler, code, blockquote, links, bullet lists, and numbered lists are
deterministic Telegram document mutations with UTF-16 entity remapping. Public
and private fields show an immediate live preview. Product advanced sections
are collapsible, and group editing uses a wide form plus an independently
scrolling variant ledger.

Final validation and deployment records:

```text
Default tests       : 562 passed, 32 skipped
TypeScript          : passed
ESLint              : passed
Prisma validate     : passed
Next.js build       : passed
Disposable PG 17    : all 40 migrations applied and current
Candidate Docker    : returned {"ok":true,"database":"ready"}
Schema migration    : none
Production backup   : /opt/telegram-store/backups/pre-full-ux-delivery-20260831T124521Z.dump
Backup bytes        : 40,480,711
Backup SHA-256      : f096161796f21f3f23e4d66207bccc3b706b4f255af685e08ebd475704ded28b
Rollback tag        : telegram-app:rollback-full-ux-delivery-20260831T124521Z
Rollback image      : sha256:21d75f569cb5c11e38e2ff417e2484868c5ff6bd65f23a928a3293a385befb7e
Production app      : sha256:4fbfd3ef4c5b0a609f2a54763d866ace7d76dd986813656a0bef3f593f4023ca
Migrator image      : sha256:1e4370570105ff2e0dca068f3afc7fe982b1700a8d2282f93413af996d2c2f70
```

Checkout maintenance was enabled before the workers stopped. The backup and
rollback tag were verified before the app-only replacement. PostgreSQL, its
volume, Caddy, schema, wallets, payments, orders, stock, delivery rows, and
customer records were not reset, reseeded, or migrated. The app and two
stateless workers were recreated. Authenticated desktop and 390 px mobile QA
passed, dashboard/inventory anchors remained stable, and the new notification
ledger rendered without private message payloads.

A private admin-chat production smoke returned HTTP 200 for `/start` and a
direct product detail callback for a product with zero ready stock. Its public
image route returned HTTP 200 `image/png`, confirming stock exhaustion does not
hide the product photo. Monitoring stayed unchanged at outbox pending 0, manual
review 84, failed notifications 11, delivery receipt ambiguity 0, and rejected
payment events 0. Checkout was reopened only after health, migration status,
workers, logs, browser QA, monitoring, and Telegram smoke all passed. A second
post-maintenance smoke returned HTTP 200 for product detail, quantity selection,
and payment-method selection without creating an order or charging wallet.
Temporary transfer archives were removed; the verified backup and rollback
image remain.

## 2026-09-05: local Binance Pay / BEP20 / language audit

The user requested USDT and multilanguage checks plus a Binance Pay transfer
workflow using the buyer's Payment Details Order ID. The provider already
existed, so the local candidate closes receipt-ID alias, API-envelope validation,
copy-button and navigation-state gaps. BEP20 verifier state guards and batch
error isolation were hardened, with direct verifier and real PostgreSQL
concurrency tests. Checkout/order/cancellation screens and active-invoice
recovery gained Indonesian/English coverage.

Production checks were limited to environment-presence booleans, public health
and public BSC RPC reads. Binance API credentials are absent, while the BSC
endpoint returned chain 56 and public health returned ready. No production DB
inspection/mutation, real financial transaction, customer message or deployment
was performed. The detailed findings, remaining language gaps and activation
requirements are in `PAYMENT_LANGUAGE_AUDIT.md`. The pre-existing additive
catalog English migration remains a local-only candidate.

## 2026-09-08: Binance Pay web-session foundation (local checkpoint)

The local candidate now extends `BINANCE_INTERNAL` with an optional private
Binance web-session verifier. This is a foundation only; it has not been
deployed, enabled, or given a real Binance cookie.

- Migration `20260908103000_add_binance_web_sessions` adds encrypted session
  metadata, account-scoped normalized web transactions, verifier-mode snapshots,
  and immutable invoice/session bindings. It is additive and was applied only to
  a disposable PostgreSQL database during validation.
- Cookie JSON is validated against Binance domains, encrypted with
  `PAYMENT_SESSION_ENCRYPTION_KEY`, and removed on session revocation. Admin
  views expose only fingerprints/status/timestamps.
- Polling owns fixed private history/detail/account-identity endpoints, bounded
  pagination/detail calls, response limits, timeout/challenge classification,
  and database leases. Matching requires exact Order ID aliases, integer
  micro-USDT, receiver/account binding, incoming `SUCCESS` USDT, and the
  original invoice window.
- Web evidence uses the existing `confirmOrderPayment()` path and cannot invoke
  manual confirmation or delivery/refund shortcuts. `USDT_BEP20` remains fully
  separate and on-chain.
- New admin/session routes, evidence ledger, and separate poll/match cron routes
  are present locally. Both
  `BINANCE_WEB_SESSION_CHECKOUT_ENABLED` and
  `BINANCE_WEB_SESSION_AUTO_CONFIRM` remain false by default.
- Poll error tracking is persisted in five-minute `BinanceWebPollMetric`
  aggregates. Both the session page and central Monitoring page show 1-hour and
  24-hour error rates plus auth, challenge, rate-limit, contract, account, and
  internal failure counts. Metrics contain no cookie, Order ID, transaction ID,
  payer name, or raw payload.
- Local checkpoint validation: 786 tests passed / 43 skipped, TypeScript, lint,
  Prisma validation, production build, all 45 disposable migrations, and the
  provider database concurrency suite passed. Production DB/credentials were
  not inspected or changed.
- Final Linux candidate images are app
  `sha256:9b914b0ffa876c8b7970fe7de5f2353a6954f56fc79b3d7fc7afa74bba0c8daa`
  and migrator
  `sha256:8dfa28044eee7828e0272831add7e880f082c1893f144a49c4da44013760693e`.
  An isolated runtime reported database ready, app healthy, restart count zero,
  cron poll/match HTTP 401 without a secret, and admin HTTP 307 without a
  session. All temporary Binance QA containers and networks were removed.
- Read-only production checks still showed app
  `sha256:7b5f07426829fac476b48f4f86960d7a53537641efd11ea2f41843fd7507283a`,
  database health ready, checkout open, and `PAYMENT_SESSION_ENCRYPTION_KEY`
  present. The two Binance web feature flags are absent, which safely resolves
  to false. No production migration or replacement was performed.

## 2026-09-08: Binance web-session foundation production rollout

The validated foundation was deployed after explicit authorization under
`binance-web-foundation-20260908T101500Z`. Global checkout maintenance was
enabled before workers stopped and remained enabled through backup, migration,
service recreation, cron smoke, log review, and authenticated admin QA.

The production PostgreSQL custom-format backup was verified with
`pg_restore --list` before any image tag changed:

```text
Backup       : /opt/telegram-store/backups/pre-binance-web-foundation-20260908T101500Z.dump
Bytes        : 49,164,302
SHA-256      : 936facae9313828fafb9fa1f78e2e6cbc93779840501861a980e825d11f5f650
Env backup   : /opt/telegram-store/backups/pre-binance-web-foundation-20260908T101500Z.env.production
Compose copy : /opt/telegram-store/backups/pre-binance-web-foundation-20260908T101500Z.docker-compose.yml
```

The existing production app and migrator received dedicated rollback tags.
Production Compose was patched from the downloaded server copy, adding only
the bounded 30-second Binance poll and match loops. The unrelated local
re-engagement difference was not copied to production. Both Binance feature
gates were written explicitly as `false` before the candidate was loaded.

Migration `20260908103000_add_binance_web_sessions` applied through only
`docker compose run --rm migrate`; a later repeat reported all 45 migrations
current. The normal Compose dependency check recreated the PostgreSQL container,
but the existing `telegram-store_telegram_store_postgres` volume remained
mounted. No volume removal, reset, truncate, seed, restore, or direct inspection
of customer, order, payment, wallet, stock, or delivery rows occurred.

```text
Production app      : sha256:3debcde39e059a6bdc0660f6021759ec2755d210912a4196a8be7f53cbbfcd7d
Production migrator : sha256:a814d1de1289e061102a09e612df6abeff9977c9ffaadfa529b25f75803e8a64
App rollback        : telegram-app:rollback-binance-web-foundation-20260908T101500Z
Migrator rollback   : telegram-migrate:rollback-binance-web-foundation-20260908T101500Z
Runtime             : app/db healthy; scheduler and notification worker running
Restart counts      : app/db/scheduler/notification worker all zero
Public health       : database ready
Disk after cleanup  : 71% used
```

The Docker save/load path normalized image IDs between Docker Desktop and the
VPS. Deployment continued only after the transferred archive checksum, every
root filesystem layer, creation timestamp, entrypoint/command, and full image
configuration hash matched the local candidate.

Authenticated Binance cron smoke returned `sessions=0`, `pages=0`,
`received=0`, `errors=0`; matching returned `scanned=0`, `confirmed=0`,
`errors=0`, and `autoConfirmEnabled=false`. Shopee poll/match and the Telegram
notification worker also completed without errors. Unauthenticated Binance
cron calls and the Telegram webhook stayed HTTP 401. New admin surfaces rendered
correctly and both 1-hour/24-hour Binance metrics showed `Belum ada data`.

The operator-configured Binance recipient setting was saved while the central
method remained disabled. No cookie or Binance web session was stored during
the rollout because the browser clipboard did not contain the supplied JSON;
the credential was not reconstructed into a command, source file, environment,
or log. The operator must paste a fresh/rotated cookie directly into the
authenticated vault before read-only validation. Checkout and auto-confirm
remain explicitly disabled until a separate controlled cutover.

The dashboard audit showed no change to product, available stock, sold stock,
preorder, manual-review, failed-delivery, ambiguous-delivery, or total-order
counts. The expiry worker finalized three pre-existing top-up rows while it
returned to service; no new order was created during maintenance and no
historical row was manually repaired. Checkout maintenance was disabled only
after all checks passed. Old temporary Docker transfer archives were removed
from `/tmp`, freeing about 6.84 GB without deleting backups or tagged images.

## 2026-09-09: Binance browser-cookie export compatibility patch

The first supplied Binance browser export was rejected before storage. Review
showed the export was structurally valid but included an empty `currentAccount`
cookie and a printable JSON `g_state` value. The old parser rejected both: it
required a non-empty value and disallowed commas even though no control or
semicolon delimiter was present.

The parser now accepts browser-export-compatible empty values and printable JSON
cookie values, while rejecting CR/LF/control characters, semicolons, foreign
domains, duplicate keys, and invalid paths. Regression tests cover empty values,
JSON-like values, semicolon injection, and control characters.

The app-only production rollout used the normal maintenance/backup/rollback
procedure. No schema migration ran and no production data rows were inspected
or changed. The failed prior session is retained only as a revoked audit row;
its 24-hour auth error metric remains visible and no credential ciphertext is
reused.

```text
Deployment ID       : binance-cookie-validator-20260909T143100Z
Tests               : 792 passed; 43 skipped across 139 passed files
Production app      : sha256:4e9394e664d1254e16a3349eaa9137d2286fe218462e0ea7fd5901ab69a74a64
Rollback app        : telegram-app:rollback-binance-cookie-validator-20260909T143100Z
Backup              : /opt/telegram-store/backups/pre-binance-cookie-validator-20260909T143100Z.dump
Backup bytes/SHA    : 50,040,503 / 413e06476681a2312add8e3c8ca92b5bd9e1aaca0677402d4943aaa8a0cbc422
Runtime             : public health ready; app/db/scheduler/worker healthy; zero restarts
Smoke               : Binance poll sessions=0/errors=0; match scanned=0/errors=0; webhook 401
Maintenance         : disabled after audit
```

The vault is ready for a fresh clipboard paste. The user must copy the cookie
JSON locally and submit it through `/admin/payment-settings/binance-web`; the
agent will not reconstruct or echo the secret from chat. Checkout and
auto-confirm remain explicitly disabled until account identity and read-only
polling are proven.

## 2026-09-09: Shopee payment check acceleration rollout

The user reported that Shopee payment checks felt slow. Investigation found two
independent 30-second Compose loops (poll and match), plus buyer refresh polling
the full bounded 24-hour history with up to six pages. The deployed app and
production Compose now reduce normal detection latency while preserving the
separate network/matching boundaries:

- Shopee upstream polling loop: every 15 seconds.
- Local evidence matching loop: every 5 seconds.
- Targeted buyer refresh: invoice-relative window (creation minus two-minute
  skew through expiry plus two-minute skew), at most three pages.
- Android fallback grace: production `SHOPEE_ANDROID_FALLBACK_DELAY_SECONDS=45`
  so three normal cookie cycles get priority; the existing 30-240 second clamp
  remains in code.

The targeted refresh remains owner-bound and ambiguity-safe. It still requires
the exact account fingerprint, amount, completed incoming status, invoice window,
and one target; it cannot revive an expired invoice or confirm a different order
or wallet top-up. The scheduler's polling and matching routes remain separately
authenticated, and session leases prevent overlapping upstream requests.

```text
Deployment ID        : shopee-fast-check-20260909T191700Z
Tests                : 792 passed; 43 skipped across 139 passed files
TypeScript / ESLint  : passed
Production app       : sha256:6878790d8b89a6d78c7264ae401de1e07d5e7cd1d3aae3de5d9268fc0bbab22b
Backup               : /opt/telegram-store/backups/pre-shopee-fast-check-20260909T191700Z.dump
Backup bytes/SHA     : 50,704,164 / 0482c1896d4ff5684070a5151cf218c53aeaa770802d9fdb1d217e6ea31ec90b
Compose SHA-256      : db8da0fea6885a30bfa225fc055743cc2e8e0fbce7c2f564ee0e1d76f93fc80d
Fallback config      : 45 seconds
Schema               : unchanged; existing migrator image retained
Runtime              : database ready; app/db/scheduler/worker healthy; zero restarts
Smoke                : poll errors=0; match ambiguous=0/errors=0
Maintenance          : disabled after final audit
```

The remote Compose file was downloaded and patched only at the two Shopee loop
sleep values; unrelated production services were preserved. No test payment,
wallet credit, order, stock, or customer record was created or rewritten.

## 2026-09-08: Shopee wallet top-up targeted refresh rollout

Production investigation found that the Shopee top-up rail itself was working:
an earlier top-up had exact `WEB_SESSION` evidence and credited successfully,
while several later expired attempts had correct Shopee snapshots but no
corresponding incoming transaction in the normalized Shopee ledger. The
dashboard's problem count combines unpaid/abandoned expiry with actual failures,
and Telegram/admin still called Shopee-backed top-ups `QRIS / DANA`.

The deployed correction adds provider-aware labels and a buyer refresh action
without altering the payment schema. The top-up creation message now says `QRIS
ShopeePay` when the active immutable provider snapshot is `SHOPEE_PARTNER` and
adds `Refresh pembayaran Shopee` only when that snapshot also uses
`WEB_SESSION`. DANA and legacy Android snapshots never receive the web refresh
button.

The refresh path is owner-bound by `chatId + invoiceNumber`, polls only the
snapshotted session with a bounded recent lookback, filters exact account,
integer amount, incoming/completed status, and original invoice window, then
passes the selected invoice attempt to `matchShopeePartnerTransaction()`. It
accepts only a `wallet_topup` target with the same top-up ID and credits through
the existing transactional/idempotent `confirmWalletTopup()` path. More than
one candidate stays ambiguous. Paid top-ups return success idempotently, while
expired, legacy, non-Shopee, foreign-owner, and unbound attempts fail closed.

Admin dashboard and wallet tables now read `QrisInvoiceAttempt.providerKeySnapshot`
and display `QRIS ShopeePay`; the legacy `WalletTopup.paymentMethod=DANA_RELAY`
storage value remains unchanged for compatibility. No existing invoice, wallet
transaction, message, or historical row was rewritten.

```text
Deployment ID        : shopee-topup-refresh-20260908T145744Z
Final app build      : shopee-topup-refresh-final-20260908T151605Z
Tests                : 790 passed; 43 skipped across 139 passed files
TypeScript / ESLint  : passed
Prisma / Next build  : passed
Schema               : unchanged; migrate deploy reported 45 current
Production app       : sha256:1c62267c7f0b21f6c32ccc13d4ce7fcb7f2309ced4db25671298b092653d0d3d
Production migrator  : sha256:cca0cdad1dd6a0d1102a77a707fafadf38a5f2a3bcd1400f7cb063d4962c23c1
Backup               : /opt/telegram-store/backups/pre-shopee-topup-refresh-20260908T145744Z.dump
Backup bytes         : 49,286,899
Backup SHA-256       : e63c0b05ed7a463bdf49853f1d8a30cde2554a59e4f8a5af3ea5b20ae42517b3
App rollback         : telegram-app:rollback-shopee-topup-refresh-20260908T145744Z
Migrator rollback    : telegram-migrate:rollback-shopee-topup-refresh-20260908T145744Z
Public health        : database ready
Runtime              : app/db/scheduler/notification worker running; zero restarts
Shopee poll/match    : errors=0; ambiguity=0 during smoke
Maintenance          : enabled before backup; disabled after final audit
```

Production QA visibly showed `QRIS ShopeePay` for both confirmed and expired
top-up rows. The pre-deploy product, stock, preorder, manual-review, failed and
ambiguous delivery, top-up problem, and total-order counts remained unchanged
at final audit. No production test top-up or financial mutation was created.

## 2026-09-06: Shopee Partner web-session safety foundation

Sanitized browser evidence verified that Shopee Partner transaction history is
requested with `POST /merchant/v1/partner-web/get-transaction-list` on
`shopeepay.shopee.co.id`. Its JSON includes a bounded time filter,
`serviceList: [1, 3]`, Jakarta locale/timezone metadata, pagination, newest-first
sorting, and a token in addition to browser cookies. The token visible in the
original screenshot was not transcribed, used, logged, or stored; it must be
rotated before any later credential test.

The local candidate now owns the exact endpoint and sends only cookies matching
its HTTPS host and request path. Cookie and metadata-token ciphertext are
separate AES-GCM payloads under `PAYMENT_SESSION_ENCRYPTION_KEY`. Uploaded
credentials start `PENDING_VALIDATION`; revocation clears all credential
ciphertext and polling leases while retaining a non-secret audit record.
Concurrent cron executions claim each eligible session with a short database
lease before performing network I/O. Transaction deduplication is now scoped to
stable merchant-account fingerprint plus external transaction ID, rather than
the replaceable web session.

The supplied response contract is now parsed fail-closed. The parser requires
`code: 0`, a `data.list` envelope, consistent `merchantId` + `storeId`, valid
epoch/amount/ID fields, completed status `3`, incoming `transactionType` `1`,
and service `1` or `3`. Indonesian grouped amounts such as `85.039` normalize
to the exact integer `85039`. The application hashes each raw row locally,
uses Shopee's numeric `transactionId` as the canonical provider key, retains
the alphanumeric external ID, derives the account fingerprint from merchant and
store IDs, and resumes bounded pagination from `next_position`.
Rows with non-payment enum values (including zero-valued pending codes) are
skipped safely instead of invalidating an otherwise valid page. The matching
worker also closes bound rows whose invoice becomes expired/cancelled and
reconciles rows whose invoice was already confirmed, preventing infinite retry
loops.

A valid page can move a session from `PENDING_VALIDATION` to `ACTIVE` for
read-only polling and persist normalized ledger rows. QRIS invoices retain
`ANDROID_NOTIFICATION` as the default evidence mode. An explicitly requested
`WEB_SESSION` invoice must snapshot an active validated session and its derived
merchant-account fingerprint. The matcher requires that fingerprint, exact
amount, and the original invoice time window, then atomically binds one
transaction to one invoice; zero candidates are `UNMATCHED` and multiple
candidates are `AMBIGUOUS`. Confirmation revalidates the bound transaction and
updates the transaction, invoice attempt, and payment state atomically.
No normal checkout path enables web-session evidence yet; Android notification
evidence remains the production source until a separately authorized, audited
cutover. The cron confirmation worker is additionally disabled by default via
`SHOPEE_WEB_SESSION_AUTO_CONFIRM=false`; matching can be observed without
financial state changes.
Dedicated admin configuration and ledger pages do not expose credentials or raw
upstream errors.
Idempotent checkout and wallet-top-up retries recheck evidence mode and Shopee
session identity inside the transaction lock, so concurrent requests cannot
silently reuse a different evidence snapshot. Polling and matching cron routes
have separate authenticated route tests.

Local validation completed with 719 tests passed and 41 configured skips,
TypeScript, ESLint, Prisma validation, and the Next.js production build passing.
The build used Next.js WASM fallback because the installed native Windows SWC
binary is invalid, but compilation and route generation completed. All 44
migrations, including `20260905190000_add_shopee_partner_sessions`,
`20260906120000_add_shopee_web_evidence_matching`, and
`20260906150000_bind_qris_merchants_to_shopee_accounts`, were also applied to a fresh
disposable PostgreSQL 17.5 PGlite database with `pg_trgm` loaded; the new enum,
invoice column, unique transaction binding index, and matching index were
queried afterward. This was the pre-rollout validation record; Docker became
available for the subsequent production rollout. No real credential, payment,
customer message, or Shopee session was used during validation.

### 2026-09-06: QRIS/Shopee merchant-account binding

The QRIS merchant configuration now has an optional, operator-verified
`QrisMerchant.shopeeAccountFingerprint` binding. This closes the gap where an
operator could select a Shopee web session for a QRIS payload without retaining
which validated merchant/store account the payload was meant to use.

The admin QRIS create/edit form lists only active, validated Shopee sessions and
sends only the opaque session ID. `createQrisMerchant` and
`updateQrisMerchant` resolve the session inside the server/database boundary,
validate its active account identity, and persist only the lowercase SHA-256
account fingerprint. Credentials, cookies, and metadata tokens never enter the
form or route payload. Android-notification QRIS remains backward compatible
with an unbound merchant; `WEB_SESSION` invoice creation now requires a bound
fingerprint and rejects a session from another merchant/store account.

Migration `20260906150000_bind_qris_merchants_to_shopee_accounts` is additive and
adds a provider-scoped fingerprint check/index. Invoice snapshots continue to
carry their own immutable evidence fields, so changing a merchant binding later
does not rewrite pending or historical invoices. New mismatch, unbound-session,
admin-route, and server-side binding tests are included.

The local suite after this change reports 719 tests passed and 41 configured
skips; TypeScript, ESLint, Prisma validation, and the Next.js production build
pass. All 44 migrations, including this additive binding migration, have also
been applied successfully to a fresh disposable PostgreSQL 17.5 PGlite database
with `pg_trgm`. The statements above describe the pre-rollout safety posture;
the complete candidate was subsequently released under the production record
below without entering a real Shopee credential or payment.

### 2026-09-06: delivery follow-up and Shopee/catalog production rollout

The eager post-credential fan-out fix and the four additive catalog/Shopee
migrations were deployed to Azure after explicit authorization. Checkout
maintenance was enabled through the authenticated admin dashboard before the
worker stop, and it remained enabled until the final audit passed.

```text
Deployment ID       : delivery-followup-shopee-20260906T090346Z
Local tests         : 721 passed, 41 skipped across 127 test files
TypeScript / lint   : passed
Prisma validate     : passed
Next.js build       : passed (Windows WASM SWC fallback)
Disposable smoke    : all 44 migrations; database ready; webhook POST 401
Applied migrations  : 20260902223000, 20260905190000,
                      20260906120000, 20260906150000
Production app      : sha256:de99cae6b2f2c3225334d56160e50b7c69cce44f896a289fb3e839109f7ba38e
Production migrator : sha256:9f9b3676c06c764510ec92ff12ba4619dcb33e5748f8ad5d3b7afe87d6c97734
Backup              : /opt/telegram-store/backups/pre-delivery-followup-shopee-20260906T090346Z.dump
Backup bytes        : 46486398
Backup SHA-256      : 2bbc58d2a695306bfbd9863833c7ed867f922b0615d1d9419b78de155402aed9
App rollback tag    : telegram-app:rollback-delivery-followup-shopee-20260906T090346Z
Migrator rollback   : telegram-migrate:rollback-delivery-followup-shopee-20260906T090346Z
App rollback image  : sha256:1db00c885a8f44af37a36b760968c0d17ef4821e0da885d9c14ad54f9d9a51bd
Migrator rollback   : sha256:1e4370570105ff2e0dca068f3afc7fe982b1700a8d2282f93413af996d2c2f70
Maintenance         : enabled before deployment; disabled after verification
Public health       : database ready; unauthenticated webhook POST 401
Runtime             : app/db healthy; scheduler and notification worker up;
                      zero restarts; no recent app/worker errors
Audit               : bridge queue 0; outbox pending 0; manual review 88;
                      failed notifications 11; delivery failed/ambiguous 0;
                      expired backlog 0; rejected events (1h) 0
Shopee             : zero sessions/credentials at that rollout; web-session auto-confirm remains off
```

The PostgreSQL service and persistent volume were preserved. Only the app,
scheduler, notification-worker, and one-shot migrator containers were
recreated; Caddy remained running. The image archive was checksum-verified on
the VPS and removed after loading. The final buyer-delivery ordering is now
`credential -> attachment -> private guide -> success channel`, with the
idempotent follow-up row retained as crash-recovery reconciliation.

### 2026-09-06: Shopee Partner contract fix deployed

The user-provided Shopee Partner session was entered through the authenticated
admin page and remains encrypted in the production vault. The original poller
sent the older `filter`/`pageSize`/`sorter` body, which caused
`UPSTREAM_CONTRACT_UNKNOWN`. The deployed app now sends the verified portal
body with `time_period`, `page_size`, completed/incoming transaction filters,
and the portal `Origin`/`Referer`, `X-Token`, `X-Timestamp-Ms`, and browser
headers. An empty `data.list` is accepted only for an already identified
session; a new session still fails closed without merchant identity.

The change was app-only. Checkout maintenance was enabled before the worker
stop and disabled only after the audit. The PostgreSQL volume was preserved;
the Compose dependency start recreated the database container but the one-shot
migrator reported all 44 migrations present and no pending migrations. No
reset, volume recreation, truncation, seed, or transactional data rewrite was
performed.

```text
Production app       : sha256:87a02659490d94d8c1f5293ddbd183a34158c3e2c44abfcfcf96966215bb5c5d
Rollback tag         : telegram-app:rollback-shopee-contract-20260906T120326Z
Rollback image       : sha256:de99cae6b2f2c3225334d56160e50b7c69cce44f896a289fb3e839109f7ba38e
Backup               : /opt/telegram-store/backups/pre-shopee-contract-20260906T120326Z.dump
Backup bytes         : 46829567
Backup SHA-256       : 95311043fcc9556fb3a47f3aceb7f223b508ebe86bb8ec3dec4795eba721fbe8
```

Validation after replacement returned public database health `ready`, app/db/
scheduler/notification-worker healthy with zero app restarts, and no recent
app error. The first authenticated cron smoke leased one session, read three
bounded pages, and persisted 15 `RECEIVED` evidence rows with
`contractUnknown=0`, `unauthorized=0`, and `errors=0`. A repeated smoke read
three pages and persisted zero duplicates. The admin session is now `ACTIVE`
with a safe error of `-`; its read-only ledger shows 15 rows. Web-session
matching/auto-confirm remains disabled, so these rows cannot independently
settle an order. Monitoring after checkout reopened remained at bridge queue 0,
outbox pending 0, rejected events (1h) 0, delivery failed/ambiguous 0, and
expired backlog 0. The temporary image archive was removed; the verified
backup and rollback tag remain.

### 2026-09-06: enable read-only Shopee polling schedule

After the contract-fix smoke passed, the production Compose scheduler was
updated to call `/api/cron/payments/shopee` every 30 seconds. The change was
limited to recreating the scheduler container with `--no-deps`; the PostgreSQL
volume and application container were not changed. The immediate authenticated
smoke returned `sessions=1`, `pages=3`, `received=0`, `unauthorized=0`,
`contractUnknown=0`, and `errors=0` (the zero received count is the expected
duplicate-safe result). The pre-change Compose file is retained at
`/opt/telegram-store/backups/pre-enable-shopee-polling-20260906T125050Z.yml`.

This enables evidence collection only. The Shopee matching route remains out
of the scheduler, and `SHOPEE_WEB_SESSION_AUTO_CONFIRM` remains disabled, so
no order or wallet payment can be confirmed from web-session rows by this
change.

### 2026-09-07: controlled Shopee web-session test cutover

The checkout service now honors `SHOPEE_WEB_SESSION_CHECKOUT_ENABLED`. With an
active, account-bound Shopee QRIS merchant, new QRIS order and wallet top-up
invoices select the newest active validated session for the same merchant
account and snapshot `WEB_SESSION`; DANA and legacy QRIS behavior is unchanged.
The normal payment expiry and globally locked unique-code allocation remain in
force.

The rebuilt app was deployed with both
`SHOPEE_WEB_SESSION_CHECKOUT_ENABLED=true` and
`SHOPEE_WEB_SESSION_AUTO_CONFIRM=true`, and the authenticated matching route
was added to the 30-second production scheduler. The staged baseline before
opening auto-confirm scanned 18 historical rows with `matched=0`,
`ambiguous=0`, `confirmed=0`, and `errors=0`; the post-gate smoke reported the
same counts with `autoConfirmEnabled=true`. No historical transaction was
bound to an invoice or confirmed by this cutover.

```text
Production app image : sha256:e97fa39600241929a78a31665dd4481944b057192fd4cf19652f6d3b17983fa9
Rollback tag         : telegram-app:rollback-shopee-web-test-20260906T170222Z
Config backup        : /opt/telegram-store/backups/pre-shopee-web-test-20260906T170222Z.env.production
Compose backup       : /opt/telegram-store/backups/pre-shopee-web-test-20260906T170222Z.docker-compose.yml
```

The first real checkout payment remains the controlled test: monitor exact
amount, account fingerprint, transaction status, invoice window, ambiguity,
and delivery idempotency before treating the cutover as generally proven.

### 2026-09-07: Telegram UX cleanup and custom-emoji policy

The Telegram buyer flow was simplified without changing payment, stock, or
delivery invariants. Product/category buttons now use Telegram Bot API styles
(`success`, `primary`, and `danger`) for availability; Premium custom emoji
decoration is limited to product/category identity. Quantity screens keep quick
presets but accept a number immediately, delivery acknowledgement no longer
opens the full order detail automatically, and delivery/private-guide copy drops
repeated decorative icons. QRIS callback errors now identify an unready Shopee
merchant/session setup instead of returning only a generic failure.

The admin route `/admin/telegram` accepts numeric custom-emoji IDs for supported
product/category identities. Telegram's official Bot API documents that custom
emoji entities and button icons require an eligible Premium bot owner (or the
Fragment additional-username condition); Unicode fallbacks remain enabled.
Native button styles are removed automatically on a style-related 400 response
for compatibility with older Bot API endpoints.

```text
Production app image : sha256:d14699ea8bb05f67e93fc0ffeefc43cdd554d2a9b1ec27553c600b23be2517e3
Rollback tag         : telegram-app:rollback-telegram-ux-20260906T182412Z
Schema               : unchanged; app-only deployment
```

### 2026-09-07: Shopee web-session rollback to restore QRIS

The first user retry after the UX deployment showed that the active Shopee
QRIS merchant had no account binding. The checkout error was
`Merchant QRIS Shopee belum diikat ke akun Shopee Partner`, so the invoice was
rejected before a QR image could be created. Both
`SHOPEE_WEB_SESSION_CHECKOUT_ENABLED` and `SHOPEE_WEB_SESSION_AUTO_CONFIRM`
were returned to `false`; normal Android-notification QRIS remains the active
path. Public health stayed `200` with database `ready`, and no order, stock,
wallet, or schema data was changed. The pre-rollback environment is retained
at `/opt/telegram-store/backups/pre-disable-shopee-web-checkout-20260906T183212Z.env.production`.

Re-enable web-session checkout only after binding the active Shopee QRIS
merchant to the validated session/account and running a controlled payment
test.

### 2026-09-07: active Shopee QRIS binding completed

Using the authenticated admin surface, `ShopeePay QRIS Utama` was bound to the
existing active validated session `Shopee Partner - Build With Reys`, whose
derived identity is merchant `22669496` and store `23556014`. The settings page
then showed a masked binding fingerprint instead of `Belum diikat`. No cookie,
metadata token, or raw QRIS payload was re-entered or exposed.

The checkout flag was first enabled with auto-confirm off, and a baseline match
returned `scanned=18`, `matched=0`, `ambiguous=0`, `confirmed=0`, and
`errors=0`. Auto-confirm was then enabled; the post-gate smoke returned the
same safe counts with `autoConfirmEnabled=true`. Public health remained `200`
with database `ready`. Only invoices created after this binding snapshot can
exercise the web-session path.

### 2026-09-07: on-demand Shopee refresh and Android fallback

Pending Shopee orders now expose a `Refresh pembayaran Shopee` action. It
triggers the authenticated cookie/session poll and matching worker, then
updates the Telegram order bubble with a concrete state instead of only
reloading the database row. Web-session evidence remains primary; validated
Android Shopee events are accepted only as an explicit fallback for a web
invoice. Older Android-snapshot invoices are never silently rewritten, and
expired invoices remain recovery-only.

```text
Production app image : sha256:54c2005322419fd09a54638c674c2c6771edafc8d2ed25d662d99401583171c5
Rollback tag         : telegram-app:rollback-shopee-refresh-20260906T192251Z
Flags                : WEB_SESSION checkout=true; auto-confirm=true; Android fallback=true
```

### 2026-09-07: Shopee cursor and targeted refresh fix

Investigation showed routine polling could retain a cursor that no longer
started at the newest transaction page. The buyer refresh also invoked the
global oldest-first matching batch, so a new invoice could be starved by old
unmatched evidence. The deployed worker now restarts routine polling at the
newest page; an explicit buyer refresh resets the cursor, looks back up to 24
hours, and matches only the selected invoice. Account fingerprint, exact amount,
time window, status, and ambiguity checks remain mandatory. Android Shopee
notifications stay available only as fallback evidence.

```text
Production app image : sha256:3e9bfdff632c2fc24644a4771209ac8e16319740a90fd9552ae39e0ef5999e07
Rollback tag         : telegram-app:rollback-shopee-cursor-fix-20260907T035136Z
Tests                 : 730 passed, 41 skipped across 127 files
```

Checkout maintenance was enabled before replacing the app and disabled after
public database health, a three-page Shopee polling smoke, and ambiguity/error
checks passed. No schema or production data rewrite was performed.

A final follow-up changed the global payment worker to scan newest Shopee
transactions first, preventing historical `UNMATCHED` rows from starving new
payments after the batch exceeds 25 rows. Targeted refresh also rejects more
than one same-amount transaction in the invoice window instead of arbitrarily
claiming the first row. It was deployed as
`sha256:39e68bc9c0df46bccd78259506f253de980c1dba3e9ab7e39e2f5e14347e4f62`
with rollback tag `telegram-app:rollback-shopee-newest-20260907T041255Z`.

### 2026-09-07: Shopee web-session constraint and fallback-order fix

The next live attempts proved that polling itself was healthy: the exact
transactions appeared in the Shopee ledger inside each invoice window. They
still remained `UNMATCHED`, while Android confirmed the corresponding orders.
Production application logs then exposed the decisive failure from the buyer
refresh path:

```text
SQLSTATE 23514
QrisAttempt_match_pair_check
```

The original QRIS constraint intentionally pairs `matchedEventId` and
`matchedAt` for bridge events. The web matcher incorrectly set `matchedAt`
without a bridge event ID, so PostgreSQL rolled back both the attempt and
Shopee-transaction binding. The app-only correction leaves `matchedAt` reserved
for bridge evidence and records web matching on the uniquely bound
`ShopeePartnerTransaction`. Existing constraints therefore remain strict and no
migration is required.

Android is now a real fallback rather than a race winner. For a `WEB_SESSION`
Shopee invoice, confirmation from the signed Android event is held for a
default 90 seconds. The endpoint returns `503` with a bounded `Retry-After`, so
the Android durable queue retains the event while cookie polling and matching
get at least two normal scheduler cycles. If web evidence confirms first, the
later Android retry finds no active invoice; otherwise the same exact
provider/package/device/amount/window event may confirm after the grace period.
The delay is configurable as `SHOPEE_ANDROID_FALLBACK_DELAY_SECONDS` and clamped
to 30-240 seconds. Orders and wallet top-ups use the same policy.

Production rollout:

```text
Tests                  : 735 passed, 41 skipped across 129 passed files
TypeScript / ESLint    : passed
Prisma validate        : passed
Next.js / Linux Docker : passed
Disposable PostgreSQL  : all 44 migrations; app database ready
Production app         : sha256:928ef3a93cb4156f3772b4c780d614a8aa33b6d2387d65e240832ef3950d2de5
Rollback tag           : telegram-app:rollback-shopee-primary-fix-20260907T151835Z
Rollback digest        : sha256:39e68bc9c0df46bccd78259506f253de980c1dba3e9ab7e39e2f5e14347e4f62
Backup                 : /opt/telegram-store/backups/pre-shopee-primary-fix-20260907T151835Z.dump
Backup bytes           : 47166938
Backup SHA-256         : df76ddc7e3f6742a9c8c554a22dc35edb88ee56eeb37e3fd387a3e5904536ab1
Migration status       : 44 current; no pending migration
Poll smoke             : sessions=1, pages=3, errors=0
Match smoke            : scanned=25, ambiguous=0, rejected=0, errors=0
Runtime                : public database ready; app healthy; restart count 0
Maintenance            : enabled before backup/workers; disabled after audit
```

The normal no-op `migrate deploy` dependency check recreated the PostgreSQL
container but preserved `telegram_store_postgres`; no reset, volume removal,
schema change, data rewrite, or direct production SQL inspection occurred.
Scheduler and notification worker were recreated and returned to service.
Monitoring ended at bridge queue 0, outbox pending 0, delivery failed 0,
delivery ambiguous 0, expired backlog 0, and rejected payment events (1h) 0.
Historical rows already paid through Android stay historical `UNMATCHED`; a new
post-rollout Shopee payment remains the end-to-end proof of web-first settlement.

### 2026-09-07: Telegram document entity failure caused incorrect refunds

The buyer supplied two Telegram screenshots showing a QRIS purchase and its
follow-up wallet purchase both being credited back immediately despite available
stock. Authenticated production order pages proved that stock exhaustion was not
the cause. Both invoices had a `DIGITAL_FILE` notification rejected by Telegram
with the exact response:

```text
Telegram rejected sendDocument: 400 Bad Request: ENTITY_TEXT_INVALID
```

The affected credentials were never accepted by Telegram. The previous API
fallback recognized explicit custom-emoji and verbose UTF-16 boundary messages,
but not Telegram's shorter `ENTITY_TEXT_INVALID` response. Consequently the
delivery worker treated the non-retryable HTTP 400 as proof that the document
itself could not be delivered and invoked the automatic wallet-refund path. The
missing regression was a test that joined the exact production error string to
the financial refund guard.

Containment and correction:

- the owner enabled global checkout maintenance;
- scheduler and the fast notification worker were stopped before patching;
- production audit found 19 failed `DIGITAL_FILE` notifications across 6
  invoices, represented by 14 failed delivery receipts and no ambiguous receipt;
- sensitive credential/attachment documents now use readable plain captions
  without message entities;
- `sendDocument` retains the same binary file and filename, and retries a
  definite presentation rejection once with the same caption text but no
  entities/custom button decoration;
- a residual entity-format rejection remains a safe failed/admin-retry state and
  cannot invoke `refundFailedDeliveryToWallet`;
- network failures and Telegram 5xx outcomes retain the existing ambiguity guard
  and are never blindly resent.

Production rollout:

```text
Tests                  : 738 passed, 41 skipped across 129 passed files
TypeScript / ESLint    : passed
Prisma validate        : passed
Next.js / Linux Docker : passed
Production app         : sha256:549e364307c0b8890119038c22f2f677c7104d4744af67fb221449761c822d70
Rollback tag           : telegram-app:rollback-delivery-entity-fallback-20260907T125632Z
Rollback digest        : sha256:928ef3a93cb4156f3772b4c780d614a8aa33b6d2387d65e240832ef3950d2de5
Backup                 : /opt/telegram-store/backups/pre-delivery-entity-fallback-20260907T125632Z.dump
Backup bytes           : 47235591
Backup SHA-256         : f5b3664fa9b7ba6b2afd86395aa4eac81bdc98f5e0a2fef4ab9d2025504b66e7
Schema                  : unchanged; no migration
Runtime                 : public database ready; app healthy; restart count 0
Shopee workers          : polling errors=0; matching errors=0
Maintenance            : remains enabled pending controlled file-delivery proof
```

The six audited invoices are financially terminal because the old worker already
credited them back and released their reservations transactionally. They remain
as incident history and must not be retried or resent directly. After one new
post-fix document is accepted by Telegram and delivery/queue/health checks remain
clean, checkout maintenance can be disabled.

The final follow-up also closed the broader question of a file being delivered
and then refunded. `refundFailedDeliveryToWallet` is now reachable from the
worker only for an explicit Telegram recipient-unreachable allowlist (`chat not
found`, blocked bot, deactivated user, or equivalent no-send-rights response).
Every other definite or ambiguous failure keeps the financial state intact and
requires retry/review. A Telegram `200 + message_id` becomes `SENT`; a network or
5xx outcome becomes `UNKNOWN`; and a post-accept database commit failure also
becomes `UNKNOWN`. Existing refund guards reject any order containing `SENDING`,
`SENT`, or `UNKNOWN` receipts.

```text
Final production app : sha256:7b5f07426829fac476b48f4f86960d7a53537641efd11ea2f41843fd7507283a
Rollback tag         : telegram-app:rollback-delivery-refund-allowlist-20260907T131439Z
Rollback digest      : sha256:549e364307c0b8890119038c22f2f677c7104d4744af67fb221449761c822d70
Backup               : /opt/telegram-store/backups/pre-delivery-refund-allowlist-20260907T131439Z.dump
Backup bytes         : 47236306
Backup SHA-256       : 3aab03e7716355222324d24d4e3d1a487bfdc7b6d7756b5f0ce5cd03abefa9f8
Runtime              : app healthy; restart count 0; workers recreated
Maintenance          : remains enabled pending controlled file-delivery proof
```

## 2026-09-12: pre-deployment performance, safety, and Telegram completion audit

This checkpoint began as a local candidate and was subsequently deployed under
`perf-telegram-ux-sec-20260912T051053Z`. The audit was performed for an
already-live population of more than 1,200 users, so the review treated
payment, wallet, stock, delivery, and customer messaging as production-critical.
Initial production diagnostics were read-only and did not inspect credential
payloads or mutate the production database.

### Production evidence and load causes

The Azure VM has 2 vCPU and approximately 846 MB RAM. Containers were healthy,
with no restart or OOM evidence, but sampled app/PostgreSQL CPU reached roughly
67%/33%. Disk was around 74% used with about 7.5 GB free. From the latest 8,000
Caddy access-log rows:

```text
/api/telegram/webhook : n=2546, p50=1.281 s, p95=2.303 s, max=20.564 s
/admin/products       : p95=1.602 s, max=8.277 s
product stock page    : p95=3.818 s, max=17.484 s
product edit page     : p95=3.990 s, max=11.828 s
/api/health           : max=6.767 s
```

The main avoidable causes were verified in source and runtime behavior:

- each normal Telegram callback could perform as many as three sequential
  `getChatMember` calls;
- Next.js admin links prefetched multiple query-heavy ledgers, product editors,
  and stock pages from a single view;
- the five-second Shopee matcher repeatedly reconsidered up to 25 historical
  `UNMATCHED` rows even when no active payment could own them;
- sidebar/inventory summaries repeated five count queries per render;
- the stock workspace used several independent lifecycle counts;
- the Caddy container JSON log had grown to approximately 714 MB without
  rotation.

### Candidate changes

- All admin `Link` components now use `prefetch={false}`. A source regression
  test scans admin TSX files and rejects missing prefetch control.
- `src/server/admin/inventory.ts` uses a one-second, bounded in-process result
  cache with single-flight coalescing. This is display-count caching only;
  checkout, payment matching, wallet balance changes, stock claims, and
  delivery decisions remain transactionally live.
- Product-stock lifecycle totals use a low-cardinality status `groupBy`; the
  owner-approved banned check remains a separate targeted count. Product list
  rendering reuses its already-loaded banned count.
- Telegram membership checks use a 60-second satisfied cache, five-second
  missing cache, a 4,096-entry cap, and single-flight requests. The explicit
  `verify_membership` callback bypasses stale cache and safely coordinates with
  any in-flight lookup.
- Shopee matching processes only evidence whose `occurredAt` can still fall
  inside an active invoice/top-up payment window and shares one in-flight run
  across overlapping scheduler calls. Exact account, amount, time window,
  status, and ambiguity checks are unchanged.
- Admin route `loading.tsx` files use the reusable
  `src/components/admin/admin-page-skeleton.tsx` composition for dashboard,
  products, edit, stock, orders, deliveries, wallet, payments, and payment
  settings. These are route-segment Suspense boundaries, not independent
  streaming queries inside an already-rendered real page.
- `deploy/Caddyfile` redacts `X-Telegram-Bot-Api-Secret-Token`,
  `X-Relay-Signature`, and `X-Bridge-Signature`. Local and production Compose
  definitions rotate `json-file` logs at 25 MB with three retained files.

### Telegram purchase completion consolidation

The buyer screenshot showed three dense blocks after a wallet purchase: the
document and four button rows, a separate payment-success/navigation message,
and a separate product guide. Clicking `Saya sudah menerima file` then replaced
another navigation view with a confirmation screen, adding work without helping
the buyer.

The candidate keeps the credential binary send and delivery receipt logic
unchanged, but changes presentation and follow-up sequencing:

1. The document caption is deliberately short and contains no inline keyboard.
2. Wallet checkout and provider payment confirmation use one navigation bubble
   for the temporary `Pembayaran diterima`/processing state.
3. The post-delivery outbox row may run only after the order is paid/completed,
   every assigned stock item has a recipient-bound `SENT` receipt, and optional
   attachment prerequisites have resolved safely.
4. That row edits the existing navigation bubble into one `Pembelian selesai`
   message containing invoice, product, quantity, total, delivered status,
   optional guide text/entities, optional redeem button, order detail,
   missing-file reporting, and catalog return.
5. `Saya sudah menerima file` is removed from the delivered document. The
   missing-file report remains available in the final summary and full order
   detail; it never causes an automatic resend.
6. A post-delivery snapshot is now queued even without custom instructions or a
   redeem URL, preventing a successful order from being left on the temporary
   `sedang disiapkan` state.

The existing immutable snapshot, stable dedupe key, recipient ownership gate,
attachment gate, and fail-closed post-accept behavior remain in force. A
malformed legacy entity snapshot still degrades to readable plain text rather
than rolling back or refunding a successfully accepted credential.

Relevant files:

```text
src/server/telegram/flow.ts
src/server/telegram/delivery-worker.ts
src/server/telegram/product-presentation.ts
src/server/products/post-delivery.ts
tests/product-post-delivery.test.ts
tests/telegram-product-presentation.test.ts
tests/telegram-completion-ux.test.ts
```

### Wallet and stock-race policy (explicitly preserved)

An earlier interpretation briefly considered disabling automatic failure
credits. That interpretation was rejected and fully reverted before this
checkpoint. The required policy is:

- verified wallet top-up credits automatically, exactly once;
- wallet checkout debits automatically, exactly once;
- when two externally paid orders race for the final stock, the transactional
  stock lock assigns it to one winner and the losing confirmed payment is
  credited to that buyer's wallet automatically, exactly once;
- mixed wallet contribution is restored when a still-pending invoice is
  cancelled or expires normally;
- legitimate SMS debit reversal remains automatic;
- no new broad `catch => credit wallet` behavior exists;
- delivery refund remains limited to explicit Telegram private-recipient
  unreachable responses. Entity formatting, file size, application/crypto/DB
  failures, network ambiguity, Telegram 5xx, and `SENDING`, `SENT`, or `UNKNOWN`
  receipt states never qualify for automatic delivery refund.

The user's money therefore does not disappear when a paid order loses the
last-stock race, while an accepted/delivered credential cannot be casually
refunded by a presentation or infrastructure error.

### Validation evidence

A disposable PostgreSQL 17.11 cluster was created outside production. All 45
migrations applied. Integration suites reset only disposable fixtures; the
cluster and its data were removed after validation.

```text
Repository tests          : 142 files passed, 18 skipped
Repository assertions     : 807 passed, 43 skipped
Opt-in PostgreSQL tests    : 43 passed across 18 DB suites
High-risk financial rerun : 15 passed across concurrency, contention,
                            wallet, and product/last-stock-race suites
TypeScript                : passed
ESLint                    : passed
Prisma validate           : passed
Next.js production build  : passed
Authenticated route smoke : 40 non-dynamic admin routes, 0 failures
Schema changes            : none
Production deployment     : subsequently completed; see rollout record below
```

The first local build used an SWC WASM fallback. A later dependency security
upgrade to Next.js 16.3.3 rebuilt successfully without that native-binary
warning and is the version present in the deployed Linux image.

The audit also exposed a test-fixture cleanup defect: the payment-availability
DB suite deleted parent orders before their `QrisInvoiceAttempt` rows. Its
cleanup order is corrected; application runtime behavior is unchanged.

### Security finding and mandatory rollout order

Production `APP_CRON_SECRET` and `TELEGRAM_WEBHOOK_SECRET` were still
placeholder/default material. The old Caddy access log also contained the
Telegram webhook authentication header. No secret value is recorded here.

The owner explicitly authorized rotation and deployment. The rollout used this
order:

1. Enable authenticated global checkout maintenance.
2. Stop scheduler and notification-worker activity.
3. Create and verify a production backup; preserve rollback app/config images.
4. Rotate cron and Telegram webhook secrets.
5. Deploy Caddy header redaction and log rotation so old material becomes inert.
6. Replace the application without a schema migration, then update Telegram
   `setWebhook` atomically with the new webhook secret.
7. Run public health, authenticated admin, payment-provider, Shopee, wallet,
   stock allocation, delivery receipt, outbox, and log-growth checks.
8. Compare webhook/admin p50/p95 and app/database CPU with the baseline.
9. Reopen checkout only after the affected-data audit and worker reconciliation
   are clean.

Residual risks are known: the notification worker still polls every second and
performs several DB operations while idle; route skeletons do not yet stream
each live metric/table independently; Shopee lacks an aggregate poll error-rate
table equivalent to Binance; the display cache is per process and will need a
shared cache or invalidation design for multiple app replicas; and the current
VM has little RAM headroom. A 2 GB VM is the next infrastructure step if active
concurrency grows.

### Production rollout completed (2026-09-12)

Before production maintenance, `npm audit --omit=dev` exposed two runtime
advisories that were not present in the earlier validation checklist:

- Next.js 16.2.12 was covered by a critical advisory that included the image
  optimization/AVIF path;
- sharp 0.35.0 was covered by a high-severity image-processing advisory.

The first Docker candidate was never deployed. It was untagged and deleted
locally after Next.js was upgraded to 16.3.3 and sharp to 0.35.4. The full 807
test suite, TypeScript, ESLint, Prisma validation, Next production build, Linux
Docker build, all 45 disposable migrations, and Linux app/database health smoke
passed again. The critical production dependency advisory count became zero.
Remaining high entries are transitive Prisma CLI/MySQL tooling advisories; the
store uses PostgreSQL, and the standalone application runtime does not ship the
Prisma migration CLI. No force-fix, Prisma downgrade, or unreviewed major
dependency change was made.

The 299,345,920-byte app archive was transferred before checkout maintenance
and matched SHA-256
`b4b37c3d58dc1c2f1dff1937826aea697eefd9450705b8b2c29418fe8986621f`
on both workstation and VPS. Docker Desktop and the VPS assigned different
image metadata IDs, but creation time, architecture, complete root filesystem
layer list, user, environment defaults, entrypoint, command, working directory,
ports, and healthcheck configuration matched exactly.

Safe rollout actions:

1. Global checkout maintenance was enabled and verified through the
   authenticated admin page.
2. Scheduler and notification worker were stopped.
3. A custom-format PostgreSQL dump was created and verified with
   `pg_restore --list`; `.env.production`, Compose, and Caddy rollback copies
   were stored separately.
4. Current app and migrator images received dated rollback tags.
5. `APP_CRON_SECRET` and `TELEGRAM_WEBHOOK_SECRET` were atomically replaced with
   new random 256-bit values. Values are intentionally not documented.
6. Production Compose gained only `json-file` rotation (`25m`, three files).
   The local re-engagement scheduler loop was deliberately omitted because it
   was unrelated drift and could have triggered customer messaging.
7. Caddy was recreated first with Telegram/relay/bridge header redaction. This
   removed the old approximately 714 MB Docker log that contained obsolete
   authentication material.
8. The new app was tagged as production and recreated without running a
   migration or recreating PostgreSQL.
9. Telegram `setWebhook` was updated from inside the new app with
   `drop_pending_updates=false`; the old webhook secret and old cron secret were
   both confirmed rejected.
10. Scheduler and fast notification worker were recreated with the new cron
    secret and log rotation, then checkout was reopened only after reconciliation.

```text
Deployment ID          : perf-telegram-ux-sec-20260912T051053Z
Production app         : sha256:cfa1465aab6d47ec9045ecda7d2d044fbf75779d6921930b9c371190685406ad
Production migrator    : sha256:cca0cdad1dd6a0d1102a77a707fafadf38a5f2a3bcd1400f7cb063d4962c23c1
App rollback tag       : telegram-app:rollback-perf-telegram-ux-sec-20260912T051053Z
App rollback image     : sha256:6878790d8b89a6d78c7264ae401de1e07d5e7cd1d3aae3de5d9268fc0bbab22b
Migrator rollback tag  : telegram-migrate:rollback-perf-telegram-ux-sec-20260912T051053Z
Backup                 : /opt/telegram-store/backups/pre-perf-telegram-ux-sec-20260912T051053Z.dump
Backup bytes           : 52,247,921
Backup SHA-256         : 01ec256c9f604df85e0a85960a417d3d1a565a6670bb08e45839e1684bdc35b8
Compose SHA-256        : 910753a889d42ca9bef22f2be721955461d8000628ca46e10804d1641ef3a0e0
Caddyfile SHA-256      : 34fd5873aea537823797a95f1ab9160c63060595f9dacbc97dde3bd1b1f5486e
Schema                 : unchanged; existing 45 migrations current
Maintenance            : disabled after final audit
```

Post-deploy evidence:

- app, database, Caddy, scheduler, and notification worker are running with
  restart count zero and no OOM state;
- app uses Next.js 16.3.3 and sharp 0.35.4;
- public and internal health return database `ready`;
- ten critical admin pages render HTTP 200 in production;
- webhook pending count is zero with no Telegram error; unauthenticated and old
  secret requests return 401;
- Shopee polling/matching and Binance web polling/matching returned zero errors
  and zero ambiguity; no payment was confirmed during smoke;
- fast notification reconciliation returned processed/sent/retry/failed/manual
  review all zero;
- outbox pending, unknown deliveries, and expiry backlog are zero;
- one initial scheduler DNS lookup failed while its container was starting;
  direct DNS then resolved, authenticated Shopee matching succeeded from inside
  the scheduler, and two later observation windows contained no repeat error;
- steady sample memory was approximately app 101 MiB, PostgreSQL 89 MiB, Caddy
  16 MiB, scheduler 4 MiB, and notification worker 8 MiB;
- Caddy redaction rejected a sentinel leak test, and rotating log options are
  active on all recreated stateless services;
- PostgreSQL was deliberately not recreated only for logging configuration.
  Its existing JSON log was approximately 0.75 MB, its volume stayed untouched,
  and the Compose rotation setting will apply on the next separately safe DB
  container recreation.

Monitoring remained `critical` only because historical records intentionally
remain visible. The 96 manual-review rows include buyer missing-file reports,
the latest of which predated deployment. Exhausted notification history includes
recipients that blocked broadcast messages. The single failed delivery is the
known 7 September `ENTITY_TEXT_INVALID` receipt: Telegram never returned a
message ID, and its stock is already `AVAILABLE`. There were no new failed,
unknown, pending, expired, or rejected financial states attributable to this
rollout.

Only the temporary image archive and the unsafe drifted Compose transfer copy
were deleted after image verification. They are recoverable only by rebuilding
or retransferring. The verified database/config backups, final rollout Compose
and Caddy copies, production image tag, and both rollback tags remain on the
VPS. Root disk ended near 73% used with approximately 7.7 GB free.

## 2026-09-12: Shopee worker regression recovery and admin loading correction

The owner supplied production evidence immediately after the performance/UX
rollout: `Shopee Partner - Build With Reys` showed `ERROR / WORKER_ERROR`, and a
real `pay_qris` callback failed with `Session Shopee Partner belum tervalidasi
atau sudah tidak aktif.` This was treated as a payment incident. Maintenance was
enabled again, scheduler and notification worker were stopped, and no order,
wallet, stock, or credential row was manually rewritten.

The cookie was not expired or rejected. The first controlled retry successfully
leased the stored session and read three transaction pages with zero auth,
challenge, rate-limit, contract, or account-mismatch result. The failure was in
the local session state machine:

1. The old generic catch changed any internal exception into terminal
   `status=ERROR, lastErrorCode=WORKER_ERROR`. Because polling and checkout only
   accepted `ACTIVE/PENDING_VALIDATION`, one transient internal error disabled
   both future polling and new Shopee QRIS checkout indefinitely.
2. Recovery v1 added a delayed `ERROR/WORKER_ERROR` polling path and safe error
   logging. It proved the vault credential could decrypt and Shopee returned
   three valid pages.
3. Recovery v1 still failed its final commit because `persistBatch()` retained
   the old `ACTIVE/PENDING_VALIDATION` condition. The row was correctly protected
   by its lease, but the status mismatch returned update count zero and raised
   `LeaseLostError`.
4. The worker incremented `errors` before recognizing `LeaseLostError`, making
   an idempotent lost-lease outcome look like a provider failure.

Recovery v2 uses the same bounded pollable-state predicate for candidate
selection, lease acquisition, credential read, and transactional persistence.
Only `ERROR + WORKER_ERROR` is recoverable, after 30 seconds. `AUTH_REQUIRED`
remains terminal `EXPIRED`, and `ACCOUNT_MISMATCH` remains terminal `ERROR`.
Generic exceptions retain the prior valid session status, record a sanitized
message in application logs without cookie/token data, and release the lease.
Lease loss no longer increments provider errors.

Production recovery evidence:

```text
Poll sessions/leased : 1 / 1
Pages read           : 3
Unauthorized         : 0
Rate/challenge       : 0 / 0
Contract/account     : 0 / 0
Worker errors        : 0
Session status       : ACTIVE
Last error           : cleared
Matcher              : scanned 0; ambiguity 0; errors 0
```

The encrypted session recovered without using the cookie/token pasted into the
conversation. Those values were not added to source, documentation, transfer
archives, or logs. Because chat is not a credential vault, a future intentional
credential refresh should be submitted only through the encrypted admin form.

Two adjacent UX corrections were included after the payment path was stable:

- broadcast stock quantities now use `stok` in Indonesian and `unit/stock unit`
  in English instead of displaying `25 file` for 25 inventory records;
- `AdminSidebar` was extracted into one shared component. Route loading renders
  the real brand/navigation with usable links and active state; only the page
  content skeleton animates. The previous `SkeletonSidebar` and its shimmer CSS
  were removed.

Final validation and rollout:

```text
Repository files      : 142 passed, 18 skipped
Assertions            : 811 passed, 43 skipped
TypeScript / ESLint   : passed
Prisma validate       : passed
Next.js 16.3.3 build  : passed
Production app        : sha256:47d4fe5635b9612a82c1acaff4d0d7ba8f58299ba2eb54093c595ec8eeba3900
Safe rollback         : sha256:ba9c84648e5cd83595cdaf84b4634262a4a20591c4ed2aa19c0129aa344fe624
Backup                : /opt/telegram-store/backups/pre-shopee-worker-recovery-stock-copy-20260912T062609Z.dump
Backup bytes/SHA-256  : 52,297,434 / 3c5e1ae46f6f2b3959edaa09f0b283888fd238daff52ee0d55b807f3ff8611e6
Schema                : unchanged; no migration
Runtime               : all containers running; restart 0; OOM false
Maintenance           : disabled after final audits
```

The incomplete recovery-v1 image was untagged and deleted so it cannot be used
as a rollback. The safe rollback image contains the complete Shopee recovery
and stock-copy correction, lacking only the later stable-sidebar refactor.
Transfer archives were deleted after verification.

### Mandatory fatal-path gate for future changes

Payment, wallet, stock, fulfillment, provider-session, and checkout changes
must not be treated as UI/refactor work. Before implementation or deployment:

1. Write down every status transition and identify which evidence makes an
   error terminal versus retryable.
2. Confirm a generic database, network, parsing, logging, or lease error cannot
   disable a valid provider, confirm money, refund money, release stock, or send
   a credential.
3. Test the complete failure/recovery sequence, not only the happy path. For a
   web session this includes `ACTIVE -> transient failure -> retry -> ACTIVE`,
   encrypted credential survival across app recreation, and terminal auth or
   account mismatch behavior.
4. Run exact amount/account/window/ambiguity and real PostgreSQL concurrency
   tests for every payment-related change.
5. Validate buyer checkout readiness and operator recovery surfaces after the
   worker test; a successful background poll alone is insufficient.
6. Use maintenance, verified backup, safe rollback image, stopped workers,
   controlled production smoke, reconciliation, and health/log observation.
7. Do not reopen checkout while a new provider error, unknown delivery, payment
   mismatch, unexpected wallet movement, or unexplained status transition
   remains.

## 2026-09-12: optional community, private-chat boundary, and menu simplification

The owner requested that users never be required to join a group/channel before
using the bot, while also emphasizing that commerce data must never leak into a
group. These are separate controls:

- membership is a marketing/community preference and is now optional;
- chat type is a security boundary and remains mandatory.

The previous webhook path checked as many as three Telegram memberships before
every non-admin update when the environment gate was enabled. Missing membership
or a temporary Telegram verification error replaced the requested action with a
join prompt. This added latency and made access to paid commerce depend on an
unrelated upstream API.

The membership checker, cache, `getChatMember` calls, and blocking prompt were
removed. Community configuration now resolves only safe channel URLs for a
voluntary `Komunitas & update` screen. The production compatibility flag is
false and ignored by the new code. Old messages containing
`verify_membership` remain safe: tapping them opens the normal menu and explains
that channels carry stock/promo information but are not required for shopping.

The private-chat guard was deliberately left at the top of
`handleTelegramUpdate()`:

```text
private chat  -> message/callback commerce flow
group         -> return without processing
supergroup    -> return without processing
channel       -> return without processing
```

The guard runs before user/session lookup, catalog callbacks, order views,
wallet access, payment actions, and document processing. A dedicated static
regression test plus the existing `isPrivateTelegramUpdate` tests enforce this
ordering. Removing membership verification therefore cannot expose customer or
credential data in a group.

The main menu was redesigned around task frequency and reduced decision load.
The owner then supplied a 1600x900 BWR Tele visual because the first plain-text
version still felt too empty. The final `/start` sends that artwork as a menu-only
photo with a short caption separator. It has four rows: products/SMS,
wallet/orders, a full-width Codex Free action, and referral/More. `Lainnya`
contains notifications/language, community, help, and back. This avoids the
mobile truncation visible when Codex Free shared a half-width row. The four-step
tutorial and individual channel rows remain outside `/start`; detailed guidance
lives in `/help`. The community screen explains that channels provide stock
updates, promos, and service news while payment and delivery stay in private
chat.

The visible Telegram command picker was reduced to:

```text
/start /catalog /sms /orders /wallet /redeem /referral /help
```

The backend continues accepting useful legacy aliases, preventing old buttons,
saved commands, or user habits from breaking. Custom emoji behavior is
unchanged and remains reserved for product/category branding; primary
navigation and command descriptions use plain text.

Reference review covered the most visible repositories under GitHub topic
`shop-bot`. The adopted ideas were limited to a short start screen, prominent
catalog/order/support paths, and a small command list. No third-party payment,
wallet, stock, or fulfillment code was reused; many examples use SQLite,
single-file handlers, or explicitly educational payment implementations that
do not meet this store's concurrency and idempotency requirements.

Production rollout:

```text
Deployment ID        : telegram-menu-optional-community-v2-20260912T092224Z
Production app       : sha256:3b1456a45b6d941458d3022091b744d6a2f9a3ecbe429ec4e7fbf4d75198ff1a
Rollback image       : sha256:cc968cb061a0db9904892c38f2121aa06020b44a4884506d927fec24706b4064
Backup               : /opt/telegram-store/backups/pre-telegram-menu-optional-community-20260912T092224Z.dump
Backup bytes/SHA-256 : 52,456,572 / 9acb6cb14f05979427218c9d746ae7d35812e721a050ef37ab97183e81352149
Repository tests     : 143 files passed; 808 assertions passed; 43 skipped
Schema               : unchanged; no migration
```

Maintenance was enabled, workers were stopped, the dump was verified with
`pg_restore --list`, the existing app was tagged for rollback, the compatibility
environment flag was set false, and only the app was recreated. Bot name,
descriptions, the eight Indonesian/English commands, and the existing webhook
were updated through Telegram with `drop_pending_updates=false`. Final webhook
state had zero pending updates and no error. Shopee remained `ACTIVE`, a
three-page poll returned zero errors, worker logs were clean, health returned
database ready, `/bwr-tele-menu.png` returned HTTP 200 with the expected 928,111
byte PNG, and maintenance was disabled. No wallet, payment, order, stock,
delivery, or credential row was rewritten.

## 2026-09-13: stock warehouse bulk download and multiline intake

The owner requested complete stock management from the product warehouse:
direct per-row operations, selected and all-stock downloads, plus a large paste
field where each newline creates one stock item. The implementation deliberately
kept checkout, payment, wallet, reservation, refund, and fulfillment transitions
unchanged.

### Operator UX and import behavior

- Each inventory row now uses a compact `Kelola` disclosure containing
  `Lihat detail`, direct `Download`, and the lifecycle-eligible edit/check/
  archive/restore/delete actions.
- Checkboxes are associated with a standalone bulk form instead of wrapping
  row-level mutation forms. This removes invalid nested-form markup while
  preserving the existing permanent-delete confirmation and backend guards.
- `Download terpilih` supports at most 100 rows from any lifecycle.
- `Download semua stok` is available from the dedicated product warehouse and
  explicitly includes all lifecycle/archive states for that product.
- The primary stock intake is now a large multiline textarea. Empty lines are
  ignored, duplicate-line estimates are collapsed in the UI, the draft survives
  failed requests, and file upload remains an alternative in the same form.
- Server intake normalizes CRLF/CR, rejects more than 5,000 pasted lines or more
  than 1 MiB pasted text, synthesizes `pasted-stock.txt`, and calls the same
  `importStockFiles()` path used by file uploads. Existing fingerprint
  deduplication, AES-GCM storage, K12/9router detection, health checking, paid
  preorder allocation, and restock broadcast behavior therefore remain single
  sourced.

### Download safety

`POST /api/admin/inventory/download` requires both admin authentication and a
valid same-origin POST. Selected exports are capped at 100 rows. Product-wide
exports are counted before decrypting, capped at 5,000 rows, loaded with a
100-row cursor, and stopped once decrypted aggregate data exceeds 24 MiB. ZIP
entry paths are sanitized/deduplicated. Every decrypted input buffer is zeroed
after ZIP construction, and the archive buffer is zeroed after the response
copy is created. Responses use `application/zip` and the existing sensitive
private/no-store header policy. Export never changes stock status or any
financial/delivery record.

The permanent-delete policy was not relaxed. Reserved, delivered, allocated, or
receipt-referenced stock remains undeletable in the database action even if a
client submits its ID. The new download checkboxes intentionally allow those
rows because download is read-only; delete continues skipping protected rows.

### Validation and production rollout

```text
Repository test files    : 146 passed, 18 skipped
Assertions               : 820 passed, 43 skipped
Focused stock tests      : 52 passed
TypeScript / ESLint      : passed
Prisma validate          : passed
Next.js production build : passed
Linux Docker build       : passed
Disposable PostgreSQL 17 : all 45 migrations applied; candidate database ready
Deployment ID            : stock-warehouse-ux-20260913T053722Z
Production app           : sha256:f76f9ed4d5ce14b4ab2b61ecf0f08393ae2f7d64d3d32efff9c5a5643876f12c
App rollback tag         : telegram-app:rollback-stock-warehouse-ux-20260913T053722Z
App rollback image       : sha256:3b1456a45b6d941458d3022091b744d6a2f9a3ecbe429ec4e7fbf4d75198ff1a
Migrator rollback tag    : telegram-migrate:rollback-stock-warehouse-ux-20260913T053722Z
Migrator rollback image  : sha256:cca0cdad1dd6a0d1102a77a707fafadf38a5f2a3bcd1400f7cb063d4962c23c1
Backup                   : /opt/telegram-store/backups/pre-stock-warehouse-ux-20260913T053722Z.dump
Backup bytes/SHA-256     : 52,855,565 / 0f7a625bb67ed2abfa8a6044a4d1caa31db07ca9018a84dfcb223b310feb6f7b
Transfer bytes/SHA-256   : 300,397,056 / 1d1b199fcd1cf515c913ed2ae63af8fd2b732c0b7bad29cc849d6d3942b24940
Schema                   : unchanged; 45 migrations current
Maintenance              : disabled after final audit
```

The image archive checksum matched locally and on the VPS before load. Global
maintenance was enabled through the authenticated route, workers were stopped,
the PostgreSQL custom-format backup passed `pg_restore --list`, and old app/
migrator images received dated rollback tags. Only the application image
contained new code; no migration was required.

Starting the two worker services through Compose unexpectedly recreated the
PostgreSQL container and reran the no-op migrator dependency. This did not
recreate or remove the named volume. The container mounted the existing
`telegram-store_telegram_store_postgres` volume, migration output reported
`No pending migrations to apply`, public health returned database ready, and
app/database restart counts remained zero. This behavior is recorded so future
rollouts should use `docker compose start scheduler notification-worker` after
a plain stop when no worker definition changed, avoiding dependency recreation.

Authenticated production smoke proved the product warehouse returned HTTP 200
and rendered the large `stockLines` textarea, newline guidance, row detail
action, `Download terpilih`, and `Download semua stok`. An empty authenticated
download request returned the stable `stock-download-empty` redirect without
decrypting a credential. A real stock ZIP was deliberately not downloaded from
production because that would expose customer inventory merely for smoke
testing.

Shopee remained `ACTIVE`; controlled polling read three pages with zero auth,
rate-limit, challenge, contract, account, or worker errors. Matching had zero
ambiguity/rejection/error. Worker reconciliation returned processed/sent/retry/
failed/manual-review all zero. Public health remained database ready, all five
long-running containers had restart count zero, and recent app/scheduler/
notification-worker error counts were zero.

Monitoring still reports historical alerts. The 30 failed `DIGITAL_FILE` rows
are all Telegram entity-format failures dated 25 August through 7 September;
they are not new rollout failures. The 98 manual-review rows comprise historical
account-redeem vault reports, buyer missing-file reports, and one old sold-out
row. The latest buyer report was 13 September at 11:24 Jakarta time, before this
rollout began at 12:37. No new pending outbox, failed/unknown delivery, expiry
backlog, or rejected payment state appeared during deployment.

Telegram briefly recorded a webhook HTTP 500 at 12:49:49 Jakarta time while the
app container was being replaced. The webhook was re-registered with the same
secret and `drop_pending_updates=false`; pending updates returned to zero and
the error timestamp did not advance. Telegram retains that historical timestamp
in `getWebhookInfo`, so it is not evidence of a current failure. Checkout was
reopened only after these audits. Temporary image archives were removed locally
and from the VPS; the verified backup and rollback tags remain.

## 2026-09-14: private account menu, textarea upload fix, and single button icon

The owner supplied two UX references. The desired part of the first reference
was a useful account overview, not a clone of another store's branding, global
revenue, user count, or reseller claim. The second reference exposed a visible
custom product icon plus a second Unicode emoji on the same `Lihat produk`
button. The owner also reported that saving stock pasted into the new textarea
returned an error.

### Textarea failure diagnosis

Production Caddy logs showed two `POST /api/admin/inventory` responses with
HTTP 422. Safe application logs identified both as `Stock file is empty`.
Browser `FormData(form)` includes an empty `File` object for an unselected
file input. Therefore a textarea-only request contained:

```text
files[0]     : name="", size=0 (browser placeholder)
stockLines   : valid pasted stock
synthetic TXT: pasted-stock.txt
```

The server kept the placeholder because it filtered only by `instanceof File`.
`importStockFiles()` then processed that zero-byte row and correctly raised
`stock-empty`, but against the wrong input. The fix filters only a file whose
name is empty and size is zero. A selected zero-byte file with a real filename
continues to fail; encryption, duplicate fingerprints, health checks, preorder
allocation, and restock broadcasts are unchanged.

A dedicated route regression sends pasted text together with the exact empty
browser placeholder and proves only `pasted-stock.txt` reaches
`importStockFiles()`. Production smoke was deliberately non-mutating: the
request used a real product ID, the empty placeholder, and one 65 KiB text line.
The deployed result was `422 stock-too-large`, not `stock-empty`, so the text
reached normal validation and no stock was inserted.

### Main-menu account information

`loadTelegramAccountSummary()` performs three parallel indexed reads:

- the current `BotSession` identity and stock-alert preference;
- the current wallet balance;
- aggregate count and spend for the user's `COMPLETED` orders.

The menu displays Telegram ID, username, completed orders, total completed
spend, wallet balance, and whether stock notifications are active. Missing
wallet/session rows use safe zero/default values. Display names are whitespace
normalized and bounded before entering Telegram text. The message remains below
the photo-caption limit.

This data is available only in a private bot chat. Incoming group,
supergroup, and channel updates still return before session or commerce
handling. Queued `MAIN_MENU` notifications also require a positive private
chat ID. No global statistics query was added, avoiding extra load and avoiding
misleading users with store-wide numbers. A reseller/member tier was not shown
because no real tier policy/model exists; it should be added only with explicit
eligibility rules.

### Product-button emoji cleanup

Product/category custom emoji remain allowed. The message formatter still places
the configured brand emoji beside product/category names. For the first product
action button, a valid `icon_custom_emoji_id` now replaces the leading Unicode
fallback emoji instead of appearing next to it. Without a custom icon, the
Unicode prefix is unchanged. Regression tests cover custom-icon, no-icon, and
already plain-label cases.

### Validation and production rollout

```text
Focused tests             : 53 passed
Repository test files     : 147 passed, 18 skipped
Assertions                : 825 passed, 43 skipped
TypeScript / ESLint       : passed
Prisma validate           : passed
Next.js production build  : passed
Linux Docker build        : passed
Disposable PostgreSQL 17  : all 45 migrations applied; candidate database ready
Deployment ID             : telegram-account-stockfix-20260914T112832Z
Production app            : sha256:f24adfff3ba30fb62d0803f654ad4e5d72557fd773c00464df41d0b4fbaf56a1
App rollback tag          : telegram-app:rollback-telegram-account-stockfix-20260914T112832Z
App rollback image        : sha256:f76f9ed4d5ce14b4ab2b61ecf0f08393ae2f7d64d3d32efff9c5a5643876f12c
Migrator rollback tag     : telegram-migrate:rollback-telegram-account-stockfix-20260914T112832Z
Migrator rollback image   : sha256:cca0cdad1dd6a0d1102a77a707fafadf38a5f2a3bcd1400f7cb063d4962c23c1
Backup                    : /opt/telegram-store/backups/pre-telegram-account-stockfix-20260914T112832Z.dump
Backup bytes/SHA-256      : 53,560,527 / 50916c15f0f7db22ad43ac7c8ff51a3bfbce4d216e347d5a98bce3d97931f5ab
Transfer bytes/SHA-256    : 300,398,080 / c1fe150e5ca509fe072844f6114515d03d9c5135827cdbca69b3743cb932848e
Schema                    : unchanged; 45 migrations current
Maintenance               : disabled after final audit
```

Maintenance was enabled through the authenticated admin route before stopping
the scheduler and notification worker. The first backup command had a quoting
error and created a zero-byte file; that invalid file was removed immediately
and was never treated as a backup. The replacement dump was written through
`sudo tee`, measured 53,560,527 bytes, passed `pg_restore --list`, and received
the SHA-256 above before rollout continued.

The prior app/migrator images were tagged for rollback and the verified
application archive was loaded. Only `app` was force-recreated. Starting the
stopped workers caused Compose to run the existing migrator dependency, but it
reported `No pending migrations to apply`; PostgreSQL remained the same
30-hour-old healthy container on the same named volume.

Final production checks:

- textarea placeholder smoke returned the expected `stock-too-large` and did
  not create stock;
- the authenticated stock warehouse still rendered textarea and bulk download
  controls;
- Shopee session status remained `ACTIVE`;
- notification reconciliation returned processed/sent/retry/failed/manual
  review all zero;
- public health returned database ready;
- app, PostgreSQL, Caddy, scheduler, and notification worker restart counts
  remained zero;
- recent scheduler/notification transport errors and app fatal errors were zero;
- Telegram webhook pending count was zero.

Telegram recorded HTTP 500 at 18:30:26 Jakarta time during the controlled app
replacement and retains that historical timestamp. Pending updates are zero and
no later timestamp appeared. Checkout was reopened only after the checks above.
Temporary transfer archives were removed locally and on the VPS; the verified
database backup and rollback tags remain.

## 2026-09-14: separate website storefront scaffold and VPS boundary

The owner plans to deploy a web storefront on a different VPS and later connect
it to the Telegram commerce system. A new storefront/ project was created
inside this workspace without adding it to the existing Telegram application
runtime or Docker image.

The current Telegram production location is confirmed and recorded:

    Host       : 70.153.137.10
    Public URL : https://70-153-137-10.sslip.io
    SSH user   : azureuser
    SSH key    : %USERPROFILE%\.ssh\telegram-store-azure
    App path   : /opt/telegram-store
    Compose    : /opt/telegram-store/docker-compose.yml
    Env        : /opt/telegram-store/.env.production

The future storefront VPS, domain, SSH key, and deployment path remain TBD. No
placeholder host is treated as production.
The storefront, its Caddy service, static assets, image optimization, and public
traffic are explicitly prohibited from running on 70.153.137.10 because that
host does not have spare capacity for a frontend workload.

The storefront has its own package.json/package-lock.json, TypeScript and ESLint
configuration, standalone Next.js build, Dockerfile, Docker Compose project,
Caddy TLS configuration, environment template, responsive landing/catalog
screens, and /api/health endpoint. Its Compose topology contains only app and
Caddy; it does not mount the Telegram PostgreSQL volume or include Prisma.

The parent Telegram build explicitly ignores storefront/ in root TypeScript,
ESLint, and Docker context. This prevents a storefront dependency or generated
artifact from entering the bot image. The storefront also has a local AGENTS.md
that forbids direct database access, shared environment files, provider
credentials, bot tokens, and stock encryption keys.

The planned connection is server-to-server HTTPS. The browser talks only to the
website VPS. The website server signs a canonical request containing timestamp,
random request ID, method, path, and SHA-256 body hash. Configuration names are:

    TELEGRAM_STORE_API_BASE_URL
    TELEGRAM_STORE_API_KEY_ID
    TELEGRAM_STORE_API_SHARED_SECRET

The Telegram backend must later verify the HMAC in constant time, reject stale
timestamps/reused request IDs, enforce an endpoint allowlist, and separately
enforce checkout idempotency. The browser must never receive the shared secret.

Catalog presentation will use a storefront-side 30-60 second cache with
stale-if-error behavior. A cache miss may call the signed backend catalog API;
ordinary page views must not repeatedly query Telegram PostgreSQL. Checkout,
wallet, payment, and order transitions never use stale data and fail closed if
the backend is unreachable.

The backend remains the sole owner of catalog truth, prices, vouchers, invoices,
payment verification, wallet mutation, stock reservation, expiry, fulfillment,
and Telegram delivery. The website may present catalog/status information and
request canonical checkout creation, but it must never duplicate those state
machines or connect to production PostgreSQL.

Telegram identity will require verified Telegram Login data and a short-lived
opaque session exchange. A browser-provided chat ID is never sufficient.
Checkout should ultimately return an order/status token and an open-in-Telegram
handoff; payment confirmation and credential delivery remain in the Telegram
backend.

Validation completed:

    Storefront npm audit           : 0 vulnerabilities
    Storefront TypeScript          : passed
    Storefront ESLint              : passed
    Storefront Next.js build       : passed
    Separate Docker image          : built successfully
    Docker image                   : sha256:bbf9aada06ad5591dea628c974e3e2fb2eb948b7937f8357ae525887724d81b3
    Container health               : ok
    Backend configured in smoke    : false (expected fail-closed state)
    Landing CTA                    : rendered
    Catalog disconnected state     : rendered
    Compose config                 : valid with the example environment

No website VPS deployment and no production API integration were performed.
The complete proposed contract, rollout order, and ownership map are in
TELEGRAM_STOREFRONT_BLUEPRINT.md.

## Web Storefront Commerce Implementation (2026-09-15)

The owner clarified that Telegram and the website must use one commerce
database and one backend API. The website remains isolated as a deployment and
does not import Prisma or connect to PostgreSQL directly. Orders now have an
additive channel boundary: Telegram orders retain Telegram delivery, while Web
orders use password-protected invoice lookup and Web download receipts. Core
pricing, payment, wallet refund, stock reservation, preorder, and idempotency
remain shared backend functions.

The Web access design deliberately requires email/invoice plus password before
showing order history; it does not expose an order table from an email-only
lookup. Passwords use bcrypt and are never stored or logged in plaintext.
Contact lookup uses a separate keyed HMAC, and opaque Web session tokens are
stored hashed and sent to the storefront only as HttpOnly cookies.

The production database was not cloned wholesale. A new disposable local
database received all current migrations, then only public catalog tables were
exported from production and restored: 5 product groups and 49 products. No
customer, wallet, order, payment, notification, provider-cookie, or production
digital-stock row was copied. Forty-four active products are served through the
signed local catalog API; each received one synthetic encrypted local stock row
for checkout testing.

That one-row fixture explains why the local UI reports `Tersisa 1` on every
copied product. It is deliberately not presented as a production inventory
clone. Production quantities remain owned by the Telegram backend and will be
returned by the signed live catalog API after an explicitly approved rollout.

The owner supplied a generic shopping illustration for products without an
image. The source was converted deterministically to an exact 1600x900 WebP
and stored at `storefront/public/placeholders/product-fallback.webp`. The shared
`ProductArtwork` component now uses it across card, detail, cart, and checkout
surfaces while enforcing a 16:9 frame. The previous generated initials/gradient
placeholder was removed.

The home popular-product cards were also changed from five compressed columns
to a reusable horizontal carousel. Cards now keep a stable readable width,
two-line title, 16:9 image, description, price/stock row, and full-width cart
action. The rail supports scroll snap, touch swipe, trackpad scrolling, and
previous/next buttons. A live browser interaction test confirmed the next
button moved the rail from scroll position 0 to 676 pixels.

The visible horizontal scrollbar was subsequently removed at the owner's
request. Previous/next buttons now overlay the left and right edges at the
exact vertical center of the card rail, while touch swipe, trackpad scrolling,
and mouse-drag scrolling remain available. All emoji-like UI symbols were
replaced with one local reusable SVG icon component covering search, cart,
menu, mobile navigation, category, checklist, quantity, payment selection, and
carousel controls.

The owner then supplied a transparent commerce illustration and a responsive
reference for the `Kenapa pilih BWR Tele?` section. The character was cropped
deterministically from the supplied 2172x724 RGBA source and saved as a 600x700
WebP at `storefront/public/why/why-character.webp` without regenerating the
artwork. The new reusable `WhyChooseSection` renders a wide desktop panel with
copy, three linked cards, a `Mudah & Aman!` badge, and the character; a two-part
tablet layout without decorative artwork; and compact mobile rows with local
SVG icons and chevrons. Browser viewport validation measured the resulting
sections at 1320x323, 984x300, and 358x327 for desktop, tablet, and mobile.

A second owner-supplied transparent illustration was assigned to category
headings. Direct use and a simple rectangular crop made the character or app
cards too small inside the shared 185-pixel heading. The source elements were
therefore cropped separately and recomposed, without generative alteration, as
the transparent 1800x400 banner
`storefront/public/headings/category-heading-banner.webp`. `PageHeading` gained
a reusable `natural` image treatment so the banner can be positioned without
changing shared layout dimensions. An experimental large category hero was
rejected because it diverged from `/shop`; the size override was removed. Live
browser measurement reports both `/shop` and `/categories` headings at exactly
185 CSS pixels on desktop. Category cards and all other page-heading consumers
remain unchanged.

An attempted `lucide-react` installation changed the storefront's caret React
resolution from 19.2.8 to 19.3.0 while an older development server remained
active. That produced an invalid-hook `useInsertionEffect` runtime error. The
external icon package was completely removed, React and React DOM were pinned
to exact version 19.2.8, the stale `.next` cache was deleted, and the dev server
was restarted from a clean build. A live Edge runtime audit then reported zero
console/runtime errors, 29 rendered local SVG icons, and a carousel-arrow
center delta of 0 pixels. This incident was confined to the local storefront;
no Telegram backend, database, Docker/VPS configuration, bot token, webhook,
or production setting was read or changed.

## 2026-09-15: Clerk authentication foundation for the storefront

The owner selected Clerk for the website account system. Clerk CLI 3.3.0 was
installed globally, authenticated interactively by the owner, and the existing
`storefront/` Next.js application was linked to Clerk application
`app_3JLkORzgGrGJAitRHvP3wrCFqhu`. The CLI-created setup includes
`@clerk/nextjs`, `ClerkProvider` inside `<body>`, `src/proxy.ts`, and catch-all
`/sign-in` and `/sign-up` routes. Environment values were pulled into the
already-ignored `storefront/.env.local`; values were not printed or copied into
source. `storefront/.env.example` contains placeholders only.

The generated proxy matcher was amended so `/(api|trpc)(.*)` is followed by
exactly one `/__clerk/:path*`. The existing storefront header now shows clear
Masuk/Daftar controls while signed out and Clerk `UserButton` while signed in,
including compact mobile controls. The auth pages reuse the storefront header,
footer, palette, spacing, and a dedicated responsive two-panel layout.
`@clerk/localizations` applies the official Indonesian localization.

The auth-page presentation was subsequently rebuilt as a full-width
split-screen surface instead of one large rounded wrapper card. The owner-
supplied character scene is optimized at
`storefront/public/auth/auth-character-scene.webp` and fills the complete left
panel, with copy and benefits layered over it. A shared Clerk appearance module
styles both sign-in and sign-up. These storefront surfaces show email and phone
number as the supported entry choices and suppress social-provider buttons and
the unused provider divider. Portrait-tablet and mobile layouts stack the
illustration and form without restarting the development server. TypeScript,
ESLint, and live `/sign-in` HTTP rendering passed; the owner explicitly deferred
Docker builds until requested, so no Docker build was run for this UI revision.

`clerk doctor` reported all Clerk checks passing: CLI current, credential-store
login present, application reachable, directory linked, and development keys
present. It also reported that Clerk production is not configured and that an
unrelated user-level Codex MCP config cannot be parsed; the Codex config was not
modified. TypeScript, ESLint, Next production build, development rendering,
and a clean Docker `npm ci` build all passed. The production-style Docker image
is `sha256:468bf14a88f0935d518bfec06c023017031b11665e1b8d776ee9caac7ea548cc`.

This is currently an authentication foundation, not a completed financial
identity migration. Existing orders, wallet balances, receipts, and downloads
remain owned by the backend `WebCustomer` plus password/session model. A Clerk
session must not gain access by matching email text. The next financial phase
must add a backend-verified Clerk token exchange and an explicit immutable
binding from Clerk user ID to one `WebCustomer`, with collision, account-link,
wallet, refund, and migration tests before removing the password flow.

No Telegram backend, PostgreSQL schema/data, production VPS, bot token,
webhook, payment setting, or Docker service was changed during Clerk setup.

Local E2E validation created a Web QRIS order, authenticated it by invoice and
password, rendered QRIS, confirmed payment through a localhost-only test gate,
created exactly one `SentDelivery(channel=WEB,status=READY)`, downloaded the
synthetic file twice from the same receipt, and completed the order. The order
created zero Telegram notifications, another Web customer could not download
the receipt, and a different password for the same email was rejected.

The Web invoice now also exposes product post-delivery guidance and the
existing encrypted product attachment after payment. The attachment is served
only through the signed backend plus the authenticated Web customer session;
it is never exposed by a public/static URL. One shared product-resource policy
is used by both order-detail serialization and attachment download, preventing
unpaid, refunded, cancelled, expired, Telegram-channel, and cross-customer
orders from reading the content. A dedicated database integration test covers
the unpaid, paid, wrong-customer, and refunded states.

Desktop and mobile visual QA found that a paid QRIS invoice still displayed
its QR code. The payment panel was split into a reusable component and now
replaces all provider instructions with a green payment-confirmed state as soon
as `paymentStatus=PAID`, explicitly warning the customer not to pay again.
Guidance, product attachment, and per-unit purchased stock remain separate,
clearly labelled download areas.

Final local validation passed 151 root test files / 838 tests, five disposable
database integration cases, root and storefront TypeScript/ESLint, both
production builds, authenticated HTTP E2E, attachment decryption, anonymous
denial, refunded-resource denial, and live desktop/mobile browser rendering.
The rebuilt local backend image is
`sha256:2c5abc0283717931a1a68f98f0e02b8ad4c30152bfa417c4e263d21790300b22`.

Production remains unchanged: its public storefront endpoint is still absent,
no migration was applied, no production database row or volume was modified,
and the main app/database containers were not restarted for this work.

## 2026-09-15: cart reference layout and Telegram feature correction

The storefront cart was redesigned with one product panel, selection subtotal,
quantity/remove controls, clear confirmation, and cached-catalog recommendation
cards. Checkout remains the existing per-product flow; multiple selections open
a chooser instead of creating several invoices automatically. No voucher field
or placeholder is present: the current Telegram implementation, shared checkout,
and Prisma schema do not implement vouchers. Old blueprint references must not
be treated as active Telegram features.

The shared sticky header now uses overflow-x: clip on document roots; its cart
target stays visible while Home is scrolled. Browser verification observed both
cart flight and pulse appearance/removal. Mobile cart artwork is contained,
public bot links are normalized, and Web delivery copy now points to orders.

Validation: storefront TypeScript and ESLint passed; root default suite passed
151 files / 838 tests (19 files and 48 tests skipped). Chrome desktop, 1024px
tablet, and 390px mobile checks covered layout, selection totals, disabled empty
selection, per-product checkout chooser, quantity decrement, removal, clear
confirmation/cancel, empty state, and recommendation add. UI tests created no
order/payment and restored the test browser's initially empty cart. Development
server stayed running. No Docker/production build, production database operation,
Telegram runtime change, provider change, or deployment was performed.

## Clerk commerce and refund-wallet candidate (2026-09-15)

Implemented code, not activated: issuer/subject-bound Clerk customer linking,
verified primary-email lookup, legacy-password proof and lockout, old-session
revocation, current-user token resolution on all protected Web order routes,
/account, /account/wallet, owner-scoped paginated wallet history, and authenticated
WALLET/WALLET_QRIS checkout via the existing createDigitalOrder transaction.
There is no Web top-up, email delivery, voucher, or Telegram-wallet merge.

The new migration file 20260915120000_add_web_clerk_identity is prepared only.
Prisma Client generation and schema validation operated on files; no migration,
DB push, seed, reset, direct data inspection, account link, or payment was run.
All real database integration tests remained skipped under the owner's explicit
no-database instruction. Both runtime flags remain off. Development Clerk
issuers are rejected by production mode.

Future deployment MUST enable global checkout maintenance before any backup,
migration, app replacement, or recovery, and keep it enabled until the authorized
audit, worker reconciliation, public health and checkout-safety checks pass.
See STOREFRONT_ACCOUNT_WALLET_ROLLOUT.md for configuration and remaining validation.


## Production storefront API connected (2026-09-15)

Deployment: storefront-api-20260915092809Z. The owner authorized required additive
migrations and backup, while prohibiting direct edits to existing user data.
Global checkout maintenance was enabled and verified before worker stop/backup.
It was disabled only after migration, app health, worker restart, monitoring,
webhook pending count, and authenticated API checks passed.

Production app: sha256:fb2cfa42f6f33baab2770638e1c54bacad4a0c4f6f2102eee1cfbb271a46634c
Production migrator: sha256:8a8183dd78d2611028df44719bffe5ed73f8c7cf891880bcf9c00077bd55ba91
Rollback tags: telegram-app:rollback-storefront-api-20260915092809Z and
telegram-migrate:rollback-storefront-api-20260915092809Z.
Backup: /opt/telegram-store/backups/pre-storefront-api-20260915092809Z.dump
Backup size: 54,614,585 bytes; pg_restore --list passed.
Backup SHA-256: 881357a12f1fa224035b81fb731a6d4c15a816e6eafca2e50ffc2178789186ca
Environment, Compose and Caddy configuration copies are retained alongside it.

Applied only 20260915014500_add_web_storefront_orders and
20260915120000_add_web_clerk_identity. All 47 migrations are current. The database
container ID remains 359356a8f9adac28a5cc64218444ff46ca20f30804e6ea8b62b7af7c80abe4be
on the same telegram-store_telegram_store_postgres volume. PostgreSQL was not
restarted, recreated, reset or restored. Only the app was replaced; the existing
stateless workers were stopped and started, and Caddy configuration was reloaded.
There was no manual customer/account binding, balance adjustment, credential
export, order rewrite, test invoice, or test payment on production.

The signed catalog API now returns HTTP 200. At verification it exposed 44 active
products, five categories, and 579 ready units. Unsigned catalog returned 401,
replay returned 409, invalid checkout returned 422, anonymous orders returned
401. App/database were healthy; restart and OOM counts were zero; worker
transport/application error counts were zero. Telegram webhook pending was zero.
Monitoring remained at bridge queue 0, pending outbox 0, manual review 102,
failed notification history 30, failed/unknown delivery 0. Rejected events in
the rolling hour changed from seven at baseline to six at final audit.

storefront/.env.local now targets https://70-153-137-10.sslip.io using a dedicated
server-to-server signing credential. No bot/provider credential was copied to
storefront. Catalog cache keys include the API base URL to separate local and
production sources. Test-payment UI and proxy are disabled for non-local backend
targets; the local simulation route returned 404 against the production setup.
Caddy redacts X-Storefront-Signature and Authorization in addition to existing
Telegram/bridge signature redaction.

Clerk commerce remains OFF in both applications. Production Clerk issuer/keys
and the storefront domain are still unconfigured. Current Clerk page login and
the legacy email/password commerce flow are distinct until that activation;
do not claim Clerk-owned production wallet access or a real checkout E2E passed.
The account-related migration is installed but existing users are not linked.

The owner-supplied login-required asset is copied unchanged to
storefront/public/auth/account-required.png. Shared AccountRequired renders a
full-page illustration, breadcrumb, login button with the intended return route,
and a shop return link. Cart, orders, invoice detail, checkout, account, and
wallet pages check Clerk sign-in before loading their content. Desktop and
390px mobile presentation were verified in Chrome.

Validation: 879 default tests passed, 50 skipped; all 47 migrations passed on a
new disposable PostgreSQL instance; 19 selected real database tests passed after
correcting a wallet test fixture to compare equal base amounts. The correction
only edits a disposable product fixture and retains the amount-collision checks.
Backend Linux build and runtime smoke passed; storefront TypeScript/lint passed.
The new database was independent of existing local and production databases.


## Database cart candidate and catalog layout (2026-09-15)

The owner replaced the browser-storage direction with database-owned cart.
WebCart, WebCartItem and WebCartMutation are now defined in Prisma. Migration
20260915173000_add_web_cart was applied only to a new disposable PostgreSQL
instance (all 48 migrations passed there); production remains on 47 migrations.
There was no production cart migration, deployment, or existing-user data edit.

Cart APIs are GET/POST /api/storefront/v1/cart behind the signed service API plus
verified Clerk-to-WebCustomer ownership, proxied by storefront /api/cart. Commands
contain only operation, product ID, quantity, expected revision and UUID retry
key. Browser-provided prices or owner IDs are rejected. One transaction locks
per customer, checks the revision, caps at 50 products / 750 units per item,
updates cart rows, and records the request hash. Retries cannot increment twice;
conflicting writes fail with a stable conflict instead of overwriting another
device. Cart reads load current public product prices and availability; private
or inactive products are represented as unavailable and can still be removed.
Cart operations never reserve inventory, debit wallet or create an order.

CartProvider now fetches the database cart and awaits mutations. All localStorage
cart persistence and its storage helper are removed. It refreshes on entering
/cart, returning focus, visibility changes, manual refresh and another tab's
BroadcastChannel notice. An uncertain network result retains the same request
for explicit retry and prevents new edits until resolved. Account changes remount
state; another account's in-flight result is discarded. Legacy browser carts
are not automatically imported. Both Clerk commerce activation flags remain off
until production Clerk configuration is provided; no client-storage fallback is
used when the database API is unavailable.

Catalog cards now use equal category, title and description slots with price and
button rows anchored consistently. Long category labels use one-line ellipsis
with a full title tooltip. The filter is sticky at 108 px with a bounded scroll
area, below the existing sticky navbar. Browser measurements found the first four
cards all 371.7 px high with identical title/price/button coordinates; navbar top
remained 0 and filter top remained 108 across scroll. Mobile page width stayed
within its viewport. The decorative Email / Nomor HP strip above the Clerk form
was removed from the shared auth shell; the actual Clerk form remains.

Validation: 28 cart tests passed including 9 real disposable PostgreSQL tests.
These cover retry dedupe, stale concurrent edits/clear, owner isolation, price
changes, inactive product handling, quantity and product limits, and unchanged
inventory/order/wallet state. Root and storefront TypeScript/ESLint passed.
Live Clerk cart E2E and production migration remain pending, not claimed passed.

## Production commerce activation completed (2026-09-15)

After explicit owner approval, Clerk production was configured for
store.buildwithreys.com, the database was backed up and verified, and only
20260915173000_add_web_cart was added. Backend/frontend were deployed from VPS
builds, workers reconciled, and checkout reopened. See the canonical completed
rollout section in PROJECT_COMPACT.md and storefront/COMMERCE_ACTIVATION_RESULT.md
for exact image/backup hashes and checks. No real payment or manual customer
binding was performed. Existing user data and the PostgreSQL container/volume
were preserved; the earlier pending-activation notes are historical.
