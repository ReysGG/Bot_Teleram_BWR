# Independent Telegram Store - Compact Knowledge Base

## Local draft: 2026-09-21 SMS OTP website

Website SMSPool purchase/history/detail routes and verified web-wallet ownership
adapter are implemented locally, with shared bot purchase/refund code. The service
picker exposes the complete public SMSPool catalog (1,386 services), searches the
full catalog, and pages 24 cards at a time. Local brand assets cover 158 exact
matches; unmatched services remain available with a neutral phone icon. New feature
flag `STOREFRONT_SMS_ENABLED` defaults false. No schema migration or production
deployment yet. Docker is running locally and the final image rebuild remains
pending after the latest catalog/logo refinements. See
`storefront/SMS_OTP_DRAFT_20260921.md` and `design/sms/README.md`.

## Latest storefront release: 2026-09-21 mobile shortcut placement

Storefront `telegram-storefront:mobile-shortcuts-20260921` is active. Floating
Telegram/admin-chat links sit above the mobile bottom navigation; Chrome live
390x844 verification measured a 16px gap. Google Search Console ownership is
verified, sitemap processed successfully (55 URLs), homepage indexing requested.
Actual indexing remains pending. Details: `storefront/MOBILE_SHORTCUTS_20260921.md`
and `storefront/SEARCH_CONSOLE_SETUP.md`. SMS OTP scope clarification is pending.

## Latest storefront release: 2026-09-21 iPhone downloads

Storefront `telegram-storefront:ios-download-20260921` is active. Shared private
download UI prepares files before a separate native share/save tap on iOS, keeps
visible download fallbacks, and offers TXT/JSON read-only preview. Login-email
exports reuse the control. No backend delivery/auth/schema changes. Tests,
release verification and physical-device limitation: `storefront/IOS_DOWNLOAD_20260921.md`.

## Latest release: 2026-09-21 empty notification polling

Backend `telegram-app:worker-idle-20260921` is active. Empty fast polls now use
one due-item probe rather than starting three claim transactions. Recovery and
quarantine still run first; actual delivery claims, slots and polling intervals
are unchanged. Checkout reopened after full service and worker verification.
The earlier one-core spike remains causally unproven. See
`deploy/WORKER_IDLE_20260921.md` for measured samples, validation and rollback.

## Latest release: 2026-09-21 admin and image performance

Backend `telegram-app:admin-performance-20260921` is active on 202.74.74.205.
Public product/group images now use bounded cached WebP optimization; versioned
image URLs rotate while originals stay in the database. Sidebar navigation warms
only on user intent; product ledger loads independently from global summaries.
Checkout reopened after fleet/worker and Chrome checks. Evidence, limitations,
resource measurements and rollback: `deploy/ADMIN_PERFORMANCE_20260921.md`.

## Latest release: 2026-09-21 admin stock takeout

Backend image `telegram-app:stock-takeout-20260920` is active on 202.74.74.205.
Admin inventory Kelola now links to `/admin/inventory/[id]/takeout` for banned
unsold stock exports (account, matching email vault login, or ZIP) with optional
transactional archiving. No schema migration. Checkout reopened after fleet,
worker, public health, and Chrome UI verification. See
`deploy/ADMIN_STOCK_TAKEOUT_20260920.md` for evidence and rollback.

This file is the canonical fast-start context for future sessions. Read it before
searching the whole repository. `PROJECT_CONTEXT.md` remains the longer history.

## Product Boundary

- This repository is an independent Telegram commerce store.
- It must not import, call, or share business data with BuildWithReys Market.
- It owns its bot, web admin, customers, catalog, orders, payments, wallet,
  encrypted stock, delivery, workers, database, deployment, and secrets.
- DANA Bridge is neutral payment-event transport only.
- Never print or commit real tokens, passwords, database URLs, encryption keys,
  admin credentials, or payment secrets.

## Current Stack

```text
Frontend/admin : Next.js 16 App Router, React 19, TypeScript
Backend        : Next.js route handlers and server modules
Database       : PostgreSQL 17 through Prisma 7
Telegram       : raw Telegram Bot API webhook integration
Production     : Docker Compose on Azure VPS behind Caddy TLS
Android bridge : Kotlin/Gradle project under android/dana-notification-bridge
```

## Runtime Architecture

```text
Telegram user/admin browser
          |
          v
Next.js app (webhook, admin, API, workers)
          |
          +--> independent PostgreSQL
          |
          +--> Telegram Bot API
          |
          +--> neutral DANA relay callbacks
          |
          +--> Android notification endpoint (DANA and Bank Jago)
```

The production Compose services are:

- `db`: PostgreSQL 17, persistent volume `telegram_store_postgres`.
- `migrate`: one-shot `prisma migrate deploy` image.
- `app`: Next.js standalone image, internal port 3000.
- `scheduler`: recurring expiry, payment, monitoring, and stock jobs.
- `notification-worker`: fast Telegram outbox worker.
- `caddy`: ports 80/443 and public TLS proxy.

## Repository Map

```text
src/app/admin                         Admin pages
src/app/api/admin                     Authenticated admin mutations
src/app/api/telegram/webhook          Telegram webhook
src/app/api/bridge                    Relay and Android payment events
src/app/api/cron                      Scheduler/worker endpoints
src/components/admin                  Reusable admin UI and modals
src/server/checkout                   Order creation and amount allocation
src/server/payment                    Provider matching and confirmation
src/server/wallet                     Wallet ledger, top-up, late credit
src/server/telegram                   Bot API, flow routing, delivery workers
src/server/telegram/flows             Reusable catalog/payment/SMS/redeem flows
src/server/stock                      Inventory import, health, sellability
src/server/redeem                     Codex Free/K12 login vault and claim flow
prisma/schema.prisma                  Canonical schema
prisma/migrations                     Additive production migrations
android/dana-notification-bridge      Android notification bridge source
deploy/docker-compose.production.yml  Production service topology
deploy/K12-Stockroom-Bridge.apk       Current distributable bridge APK
```

Catalog hierarchy routes:

```text
/admin/product-groups                 Parent catalog list/search/sort
/admin/product-groups/new             Create a parent such as ChatGPT
/admin/product-groups/[id]/edit       Edit parent and manage child variants
/admin/products                       Sellable SKU/variant management
```

## Payment Architecture

### Supported Methods

- `DANA_RELAY`: QRIS/DANA exact-IDR invoice.
- `WALLET`: full internal wallet payment.
- `WALLET_QRIS`: wallet first, exact-IDR remainder via DANA.
- `JAGO_TRANSFER`: exact-IDR Bank Jago transfer.
- `BINANCE_INTERNAL`: Binance Pay with Order ID verification.
- `USDT_BEP20`: on-chain BSC verification using an invoice address snapshot,
  exact token units, transaction hash uniqueness, block time, and confirmations.

### Binance Pay web-session foundation (deployed; financial gates closed)

- `BINANCE_INTERNAL` has a production-deployed web-session verifier foundation that does
  not require Binance API key/secret. The official signed API remains optional.
- The web path reads Binance's private Payment History/Detail endpoints through
  an encrypted admin-uploaded cookie session. Cookies are never stored in source
  or logs; `PAYMENT_SESSION_ENCRYPTION_KEY` is reused for vault encryption.
- New invoices snapshot verifier mode, session ID, recipient ID, and account
  fingerprint. Web evidence is stored in account-scoped `BinanceWebTransaction`
  rows and matched only by exact Order ID alias, amount, receiver, currency,
  incoming direction, completed status, and invoice window.
- Ambiguity, account mismatch, malformed/challenged responses, session expiry,
  and upstream errors fail closed. They cannot confirm, deliver, or refund an
  order automatically. As explicitly requested on 2026-09-20, active Binance
  and USDT invoices also support audited admin manual approval through the
  shared order confirmation service; reference and review reason are required.
- Admin routes are split into `/admin/payment-settings/binance-web` for session
  lifecycle and `/admin/payments/binance` for the evidence ledger. Polling and
  matching use separate authenticated cron routes.
- Poll reliability is persisted in five-minute aggregate buckets. The Binance
  session page and `/admin/monitoring` show 1-hour/24-hour run counts, success,
  failure rate, evidence volume, and separate auth/rate-limit/challenge/
  contract/account/internal-error counters without storing customer identities
  or raw provider payloads.
- `BINANCE_WEB_SESSION_CHECKOUT_ENABLED` and
  `BINANCE_WEB_SESSION_AUTO_CONFIRM` are explicitly `false` in production. The
  additive migration and scheduler loops are deployed, the recipient setting is
  configured with the central Binance method still disabled, and no production
  cookie/session or payment cutover has been performed yet.

USDT BEP20 invoices use the manually configured IDR/USDT rate and a dedicated
payment window. The default is `USDT_BEP20_PAYMENT_EXPIRY_MINUTES=30`, while
Rupiah methods keep the normal `PAYMENT_EXPIRY_MINUTES=5` window. Telegram sends
a locally generated black/white address QR plus paste-safe `Salin alamat` and
`Salin nominal` buttons. The QR contains only the raw recipient address; network
and exact amount remain explicit invoice text. Never write the live recipient
address into source, tests, or documentation.

Admin switches live at `/admin/payment-settings`.

### Payment Admin Routes

Payment admin pages are deliberately split by responsibility:

```text
/admin/payment-settings               Global enable/disable switches
/admin/payment-settings/qris          Select and audit the active QRIS merchant
/admin/payment-settings/qris/new      Add an encrypted static QRIS payload
/admin/payment-settings/qris/[id]     Edit/activate/archive one QRIS merchant
/admin/payment-settings/jago          Edit Bank Jago account
/admin/payment-settings/binance       Edit Binance Pay recipient
/admin/payment-settings/usdt-bep20     Edit BEP20 address/confirmations
/admin/payment-settings/usdt-rate      Edit shared IDR/USDT rate
/admin/payments                        Operations hub
/admin/payments/qris                   QRIS merchant/invoice snapshot ledger
/admin/payments/reconciliation         DANA/Jago rejected-event recovery
/admin/payments/jago                   Bank Jago ledger/manual active approval
/admin/payments/binance                Binance Pay verifier ledger
/admin/payments/usdt-bep20             BEP20 verifier ledger
```

Do not recombine provider edit forms, ledgers, and reconciliation into one page.
New payment methods must receive dedicated edit and ledger routes.

### Multi-merchant QRIS Preparation

- QRIS merchant configuration is stored in `QrisMerchant`; the decoded static
  EMV payload is CRC-validated, encrypted with AES-256-GCM, and never displayed
  again. Admin pages expose only a SHA-256 fingerprint.
- Exactly one enabled/ready merchant can be active for new checkout. Activation
  uses a database advisory lock plus a partial unique index.
- `QrisInvoiceAttempt` stores an immutable merchant/provider/package/device/
  payload, amount, and expiry snapshot for each new QRIS order or wallet top-up.
- A static QRIS payload (`01=11`, no fixed tag `54`) becomes dynamic per invoice
  by changing it to `01=12`, inserting the exact amount, and recalculating CRC.
- Switching or archiving the active merchant affects only new invoices. Pending
  and historical invoices retain their original encrypted snapshot.
- Existing rows without a QRIS attempt remain legacy DANA-compatible. The
  validated `PAYMENT_QRIS_BASE_PAYLOAD` env value is available only when the
  explicit legacy switch is enabled and no database merchant is active.
  Archiving or disabling a database merchant never silently reactivates it.
- Event confirmation requires the snapshot provider/package/device, exact
  amount, invoice window, target ownership, and one unclaimed match.
  Attempt-less legacy invoices are accepted only from DANA.
- A database DANA merchant without `trustedDeviceId` is relay-only. Android
  events are accepted only when their signed `deviceId` is in the immutable
  invoice snapshot. Legacy env mode can explicitly allow device IDs through
  `DANA_ANDROID_BRIDGE_DEVICE_IDS`; an empty value is relay-only.
- DANA snapshots may register a neutral relay claim. Non-DANA QR merchants must
  not create a DANA relay claim.
- Shopee Partner is registered as a code-owned QRIS provider with the exact
  verified Android package `com.shopeepay.merchant.id`. It remains non-relay
  and cannot be activated for checkout until its exact bridge `deviceId` is
  stored on the merchant configuration.
- Android and server parsers accept only the verified incoming contract
  `Pembayaran sebesar Rp... telah diterima pada transaksi ...` from that exact
  package. Group summaries, similar wording, and all unknown packages remain
  ignored or `UNTRUSTED` and are never allowed to confirm a payment.
- The legacy DANA env QRIS is now an explicit admin-controlled source instead
  of an implicit merchant-count fallback. `/admin/payment-settings/qris`
  always shows its safe status/fingerprint and lets the admin select it,
  disable it, or atomically import it into the encrypted merchant vault.
- Activating or creating an active database merchant disables the legacy env
  fallback under the same advisory lock. Selecting the legacy source releases
  the active database merchant; disabling it leaves QRIS unavailable until a
  database merchant is activated. Existing invoice snapshots never change.
- `/admin/payment-settings` shows the active QRIS provider explicitly, while
  `/admin/payment-settings/qris` is the dedicated card selector for legacy
  DANA, DANA vault merchants, and ShopeePay / Shopee Partner merchants. Every
  routing change still uses a confirmation modal and the shared activation
  transaction.
- The merchant form lists recent `BridgeDeviceStatus` heartbeats and reuses the
  same Android Device ID when DANA and Shopee Partner run on one phone. The
  newest compatible device is selected automatically for a new Shopee QRIS;
  manual Device ID entry remains a draft-only fallback until heartbeat proves
  ownership and compatibility.
- Shopee QRIS activation fails closed unless the exact Android Device ID has a
  recorded heartbeat and reports bridge version `1.5.7` / version code `20` or
  newer. Saving an incomplete Shopee merchant as a non-active draft remains
  allowed.
- QRIS image upload decodes PNG/JPEG/WebP locally in the browser, retries with
  a center-square crop for poster-style images, preserves internal EMV TLV
  spaces and CRC, and recognizes the exact Shopee merchant-account identifier
  to preselect the correct provider. The raw payload is not displayed again
  after encrypted storage.
- `QrisMerchant.shopeeAccountFingerprint` optionally records the operator-verified
  binding between a Shopee QRIS payload and one validated merchant/store account.
  The admin selector submits only an
  active Shopee session ID; the server reads the account fingerprint from the
  database and never trusts a hidden fingerprint value. `WEB_SESSION` invoices
  require a bound merchant fingerprint and an exact session-account match;
  Android-notification evidence remains compatible when the binding is absent.
- The binding is copied into the immutable invoice evidence snapshot. A later
  merchant edit cannot change an existing invoice, and a mismatched or revoked
  session fails closed before an invoice is created.

### Reusable Manual Recovery

- `admin-recovery-policy.ts` is the shared UI/server eligibility source.
- `admin-manual-approval.ts` is the authenticated admin command boundary.
- `AdminOrderPaymentAction` and `AdminWalletTopupAction` are reused across
  dashboard, order list/detail, wallet, and provider ledger pages.
- Active DANA/Wallet+QRIS/Jago invoices can be manually approved by an admin.
- Stale pending invoices are never fulfilled; after the expiry worker finalizes
  them, the safe recovery is wallet credit without the unique code.
- Binance and USDT BEP20 remain verifier-only and cannot be manually bypassed.
- Rejected Jago events can be reconciled only with trusted Jago provider/package,
  exact amount, original payment window, and an unclaimed target.

### Amount and Provider Collision Rules

- `allocateUniqueCode()` uses one global advisory lock and checks active order
  payments plus active wallet top-ups.
- The same base price plus unique code is therefore not normally allocated to
  two simultaneous invoices, even when their providers differ.
- Android matching is additionally provider-aware:
  - DANA packages can match only DANA-backed methods/top-ups.
  - Jago package can match only `JAGO_TRANSFER` methods/top-ups.
- Thus a QRIS customer and a Jago customer remain isolated even if legacy or
  manually-created data ever contains the same exact billed amount.
- More than one match inside the same provider bucket is `ambiguous`; nothing
  is auto-confirmed and admin reconciliation is required.
- Exact amount, creation/expiry window, event idempotency, and target ownership
  are revalidated in the confirmation transaction.

### Android Provider Classification

Trusted packages are defined in `src/server/payment/android-payment-provider.ts`:

```text
DANA            : id.dana, id.dana.kasir
JAGO            : com.jago.digitalBanking
SHOPEE_PARTNER  : com.shopeepay.merchant.id
```

Jago incoming formats currently recognized:

```text
<NAME> telah mengirim Rp17.573 ke kamu
Kamu menerima kiriman Rp35.098 dari <NAME>
Kamu menerima Rp10.565 dari GoPay
```

Outgoing `Kamu telah membayar ...` notifications must remain ignored.

Current distributable Android bridge:

```text
Version     : 1.5.7 (versionCode 20)
Application : com.k12stockroom.danabridge
APK         : deploy/K12-Stockroom-Bridge.apk
SHA-256     : EEEF2AD4D34C2B12BF433757B776C3DB74B942100283FED20A3AA8780F71D55D
```

Version 1.5.7 retains the DANA and Jago behavior from 1.5.6, trusts the exact
Shopee Partner package, forwards only the verified incoming-payment format,
ignores group summaries, and shows a selectable/copyable bridge device ID near
the top of the app. Unknown packages remain `UNTRUSTED` and are never queued or
forwarded. Installing it over 1.5.5 is an in-place app update that preserves the
saved endpoint, generated device ID, and encrypted bridge secret when the same
package/signature is retained.

Last ADB verification found bridge `1.5.5` (`versionCode 18`) still installed on
the merchant phone. ADB was then disconnected to conserve the laptop battery,
so `1.5.7` has been built but not installed and the preserved device ID has not
yet been copied into a Shopee merchant configuration.

### Wallet Top-up

- Top-up requires wallet checkout plus at least one ready Rupiah provider.
- QRIS/DANA and Bank Jago can be independently enabled.
- `WalletTopup.paymentMethod` snapshots `DANA_RELAY` or `JAGO_TRANSFER`.
- Jago top-ups use `JagoWalletTopupAttempt` and an immutable account snapshot.
- A Jago top-up never creates/registers a DANA relay claim.
- Telegram shows provider choice only when both providers are ready.
- Jago invoices expose Telegram `copy_text` buttons for raw account and amount.

### Expiry and Manual Recovery

- Pending invoices expire after the configured payment window (normally 5 min).
- An expired DANA or Jago product payment can be credited to the buyer wallet
  without the unique code; the product remains undelivered.
- A missed pending Jago notification can be manually confirmed only through the
  explicit authenticated admin recovery path and confirmation modal.
- Manual recovery writes the normal payment/wallet audit fields and remains
  idempotent.

## Order and Stock Invariants

- Telegram updates, checkout keys, payment events, stock allocation, wallet
  mutations, notification outbox rows, and delivery receipts are idempotent.
- Stock allocation and payment transitions use transaction/advisory locks.
- Digital stock is encrypted at rest.
- One stock credential must never be delivered twice.
- Paid orders deliver automatically; stock contention rejects/refunds the late
  buyer safely.
- `ORDER_MAX_QUANTITY` defaults to and is hard-clamped at 750. The Telegram
  selector and checkout further cap each request by current sellable stock or
  preorder slots and by the PostgreSQL `Int` amount ceiling.
- Digital delivery claims at most 100 order units at a time. K12 and TXT stock
  is combined; mixed/generic inventory is zipped; rendered bundles are capped
  at 20 MiB and finalized independently so a completed bundle is never resent.
- HTTP 401 sale behavior is product-specific. HTTP 402 remains blocked unless
  an explicit owner policy permits the relevant banned-stock workflow.
- Never run a fresh/reset migration or recreate the PostgreSQL volume.

### Product Groups and Variants

- `ProductGroup` is a non-sellable catalog parent such as ChatGPT or Claude.
- Each sellable child remains a normal `Product`, so price, preorder, banned
  policy, encrypted stock, checker, checkout, and delivery stay isolated per
  variant.
- `Product.groupId` is nullable. Existing products and intentionally standalone
  products therefore keep their previous catalog and checkout behavior.
- Grouped products use `variantLabel` and `groupSortOrder` for the child menu.
- An inactive group hides every child from new catalog, detail, quantity,
  payment-option, broadcast, and checkout flows. Existing orders remain valid.
- An inactive product uses the same full-unpublish policy for that product.
  Status changes acquire the product inventory lock, and the general product
  edit form cannot overwrite status from a stale tab. Stock, existing invoices,
  order history, and delivery receipts are preserved.
- Order items snapshot group ID/name and variant label; renaming or regrouping a
  product never rewrites historical order presentation.
- Group and variant labels are case/whitespace-insensitively unique within their
  relevant scope, preventing indistinguishable Telegram choices.
- Telegram top-level catalog mixes parent groups and standalone products. A
  group opens a paginated variant menu; legacy `product:<id>` callbacks and old
  catalog session payloads remain supported.
- Group availability and advertised `mulai` price are calculated from the same
  best availability tier, so an unavailable cheap variant cannot make an
  in-stock parent advertise a misleading price.

### Product Media and Post-delivery Guidance

- Product create/edit forms accept a validated PNG/JPEG/WebP/GIF image upload,
  show a local preview before submit, and allow the stored image to be removed.
- Active product and product-group detail screens in Telegram now render their
  configured image as a photo with the existing caption entities and inline
  purchase/navigation keyboard. Stored Base64 media is exposed only through a
  read-only active-catalog image route; the authenticated admin route remains
  private. External media must be credential-free HTTP(S).
- Telegram photo captions are capped on a safe UTF-16 boundary at 1,024 code
  units. Invalid or rejected legacy media falls back to the same text detail so
  an image can never hide a product or its buy button. Ambiguous network
  outcomes are not blindly resent. Text-to-photo and photo-to-photo navigation
  reuse the remembered bubble through `editMessageMedia`; photo-to-text uses
  the existing protected delete-and-send fallback.
- New-product announcements reuse the same photo presentation and text
  fallback. Editing an existing product still does not silently broadcast it.
- The same product photo stays attached while the buyer moves from detail to
  quantity selection, custom-quantity validation, and payment-method choice.
  Stock-out/preorder status changes only the caption/buttons; it does not hide
  the image. The media is replaced only when checkout intentionally sends a
  payment artifact such as QRIS or an invoice message.
- Product index pages render the image through the authenticated
  `/api/admin/products/[id]/image` endpoint. List queries deliberately omit the
  Base64 image and encrypted attachment bodies so pagination does not load
  multi-megabyte media columns for every row.
- Each product can define optional `postDeliveryInstructions` and an optional
  HTTPS-only `redeemUrl` from its dedicated create/edit form.
- The Telegram worker queues one immutable post-delivery message per distinct
  configured product after every purchased stock unit is accepted by Telegram
  and after the optional product attachment. Buying many units of one product
  therefore sends one guide, while a mixed-product order sends one guide for
  each configured product.
- The post-delivery dedupe key is `orderId + productId`. A redeem URL is exposed
  as an inline `Buka tempat redeem` button; URLs containing credentials or using
  a non-HTTPS scheme are rejected.
- Delivery order is: digital file, optional attachment, optional product guide,
  then success-channel announcement. Ambiguous Telegram outcomes, including a
  gateway `5xx` during a credential/file upload, fail closed to manual review
  instead of automatically resending a possibly accepted secret.
- The final credential worker eagerly fans out attachment/guide rows after its
  commit, while retaining the idempotent follow-up row as a crash-recovery
  fallback. Private attachment and guide priorities stay ahead of public
  catalog broadcasts, so a busy broadcast outbox cannot starve a buyer's guide.

### Admin Telegram Rich-text Formatter

- Free-form Telegram text in the admin website uses the reusable
  `TelegramRichTextEditor` on public product/group descriptions, private
  product post-delivery guidance, mass broadcasts, and direct order messages
  to a buyer.
- Public catalog text and private buyer guidance are separate domains. Product
  and group descriptions are marked `Publik`; post-delivery instructions are
  marked `Privat pembeli`. Private guidance is never selected or composed by
  product detail, group catalog, or product-announcement messages.
- The editor provides bold, italic, underline, strikethrough, spoiler, inline
  code, HTTPS links, blockquote, bullet list, numbered list, clear-format, live
  character count, and a Telegram-style preview. Write/preview uses a compact
  tab instead of permanently doubling the form height. The toolbar wraps at
  desktop and mobile widths instead of introducing a horizontal scrollbar.
  Link entry uses an in-app modal rather than `alert()` or `prompt()`.
- The browser submits readable plain text and a separate entity array. The
  server never trusts editor HTML: it reparses JSON, allows only the supported
  entity types, validates integer UTF-16 offsets and lengths, rejects crossing
  spans/code overlap/nested blockquotes, and permits only credential-free HTTPS
  links.
- Telegram receives `entities`, not raw MarkdownV2 or HTML. This avoids escape
  bugs for underscores, asterisks, brackets, parentheses, tildes, backticks,
  and other user-entered characters while matching
  the official Bot API `MessageEntity` UTF-16 contract.
- Product and broadcast entity metadata is stored as bounded JSON arrays.
  Direct order messages use a versioned immutable outbox snapshot and retain a
  plain-text fallback for messages queued by older application versions.
- Sensitive customer notifications fail closed outside positive numeric
  private chat IDs. Digital files additionally require every claimed row and
  the destination chat to match the owning order; product attachments,
  post-delivery guidance, direct admin messages, and SMS OTP notifications
  perform the same owner-recipient binding before Telegram is called.
- `SUCCESS_CHANNEL` no longer trusts its stored `messageText`. The worker
  rebuilds a bounded public message from the referenced order or SMS order,
  masks the buyer, strips control characters, suppresses email/token-shaped
  labels, and moves unknown success-channel rows to manual review. Product
  credentials, files, formatted customer guidance, OTP content, and internal
  errors are never forwarded to the public channel.
- Rich-text validation rejects entity offsets that split a UTF-16 surrogate
  pair, preventing an emoji boundary from reaching Telegram as an invalid 400
  request.
- Telegram product detail, product-group, and product-created announcement
  messages compose independently formatted header, public description, and
  footer documents. Entity offsets are shifted only after custom emoji are
  inserted, and descriptions are truncated on safe UTF-16 boundaries.
- The dedicated product workspace uses a compact page header, gives the edit
  form the dominant column, and keeps stock upload in a smaller sticky rail.
  Product configuration is split into reusable sections for public catalog
  data, group/variant placement, media, private buyer guidance, and preorder.

### Automated Telegram Re-engagement

- Re-engagement uses `BotSession` as the bot-user identity and activity source.
  `lastInboundAt` is updated only by an inbound Telegram message/callback; do
  not use the generic session `updatedAt` for inactivity decisions.
- The audience intentionally includes reachable users who never purchased and
  users with `broadcastEnabled=false`. Product-announcement preference and
  automatic win-back are separate policies by owner request.
- `telegramReachable=false` is the hard safety suppression for chats Telegram
  permanently rejects. A new inbound update restores reachability.
- Existing buyers are classified from successful paid product orders or
  completed SMS orders. Recent chat activity, an active order/top-up/SMS flow,
  or pending operational outbox work delays the reminder.
- One advisory-locked scheduler batch writes `REENGAGEMENT` outbox rows with a
  per-user/per-inactivity-episode dedupe key. The normal Telegram worker sends
  them at low priority after payment, delivery, refund, OTP, and stock events.
- Default policy is disabled, buyer inactivity 30 days, never-buyer inactivity
  7 days, 14-day cooldown, at most 3 reminders per inactivity episode, and 50
  queued recipients per run. The scheduler calls it every 30 minutes.
- The worker rechecks the global enable switch immediately before sending.
  Disabling the feature therefore fails queued reminder rows closed.
- Admin configuration and ledger are deliberately separate:

```text
/admin/broadcasts/reengagement          Settings, previews, confirmation, run now
/admin/broadcasts/reengagement/history  Searchable/paginated delivery ledger
```

- Unicode brand icons are the reliable default: ChatGPT/OpenAI uses `🤖`,
  Claude/Anthropic uses `🧠`, Codex uses `⌨️`, and Gemini uses `✨`. Telegram
  custom emoji remains optional and requires an eligible bot plus known
  `custom_emoji_id`; never make catalog readability depend on it.

- Local code now supports admin-configured Telegram custom emoji for two brand
  families: ChatGPT/OpenAI/GPT/Codex and Claude/Anthropic. Configure them from
  the admin Telegram chat by sending an actual Premium custom emoji entity:

```text
/setemoji chatgpt <custom emoji>
/setemoji claude <custom emoji>
```

- Custom emoji decoration is intentionally limited to product/category identity:
  catalog rows, group/product headings, and product announcements. Status,
  quantity, payment, navigation, and delivery controls stay plain so the flow
  remains scannable. Text containing both brand families can carry both custom
  emoji entities; row buttons use at most one leading product/category icon.
- Telegram Bot API 10.3 also supports native inline-button styles: `success`
  (green), `danger` (red), and `primary` (blue). Availability buttons use these
  styles, with a plain-button fallback if an older endpoint rejects the field.
- Per Telegram's official Bot API documentation, custom emoji entities and
  button icons require an eligible bot/owner Premium entitlement (or the
  Fragment additional-username condition); Unicode fallback remains mandatory.
- Unicode fallback text is always retained. If Telegram returns a permanent
  HTTP 400 specific to the custom emoji entity or button icon, the API wrapper
  retries once without the custom decoration so catalog and delivery remain
  functional.

## Redeem / Outlook Login Vault

- Admin page: `/admin/redeem`.
- Upload format: TXT, one non-empty account per line:

```text
email----password----client ID----token
```

- Files are encrypted and dashboard output is masked.
- Upload supports click selection and native drag-and-drop.
- Dropped files must be copied into the hidden input with `DataTransfer`; state
  alone is insufficient because multipart POST reads `input.files`.
- No client-side file-count limit. Current safety limits are 5 MB per file and
  100,000 parsed rows per request.

## Production VPS

```text
Public URL : https://70-153-137-10.sslip.io
Host       : 70.153.137.10
User       : azureuser
SSH key    : %USERPROFILE%\.ssh\telegram-store-azure
App path   : /opt/telegram-store
Compose    : /opt/telegram-store/docker-compose.yml
Env file   : /opt/telegram-store/.env.production
```

Do not store a VPS password in this repository. `azureuser` has non-interactive
sudo for the Docker workflow.

Production image tags:

```text
telegram-app:production
telegram-migrate:production
```

### Safe Deployment Runbook

1. Run tests, typecheck, lint, Prisma validate, and production build locally.
2. Build both Docker targets locally.
3. Create and verify a production PostgreSQL dump under
   `/opt/telegram-store/backups/`.
4. Tag current production images with a dated rollback tag.
5. `docker save` locally, transfer with `scp`, verify SHA-256 on the VPS.
6. Load images on the VPS.
7. If schema changed, run only `docker compose run --rm migrate`.
8. Recreate only `app` unless another service definition actually changed.
9. Verify container health, migration status, logs, and public `/api/health`.
10. Delete only the temporary transfer archive. Keep DB backup and rollback tags.

Never use `migrate reset`, `db push --force-reset`, `docker compose down -v`, or
delete/recreate `telegram_store_postgres`.

## Current Production State

- Latest applied production migration:
  `20260915120000_add_web_clerk_identity` (47 migrations current).
- Production already includes migration
  `20260824113000_add_reengagement_settings`. It adds only bot activity,
  reachability, win-back settings, and outbox indexes. Existing sessions are
  backfilled to the migration timestamp and the feature defaults to disabled,
  preventing an immediate historical-user blast.
- Product Groups / Variants was deployed additively on 2026-08-24 after an
  explicit production authorization. The migration created the parent catalog
  table, nullable product grouping fields, and immutable order snapshots without
  resetting or rewriting transactional rows.
- Production already includes migration
  `20260825100000_add_telegram_custom_emoji_settings`. It adds only nullable
  runtime-setting fields for the ChatGPT and Claude Telegram custom emoji IDs
  plus audit metadata. It does not update product, stock, wallet, payment, or
  order rows.
- Production applied migration
  `20260829100000_add_product_post_delivery_instructions`. It adds only nullable
  `Product.postDeliveryInstructions` and `Product.redeemUrl` columns with
  length/HTTPS checks. It does not rewrite product, stock, order, payment, or
  wallet rows.
- Production applied migration
  `20260830100000_add_telegram_rich_text_entities`. It adds bounded JSONB entity
  arrays to Product post-delivery guidance and AdminBroadcast records, using an
  empty-array default for existing rows. It does not modify wallet, payment,
  stock, order, delivery, or customer values.
- Production applied migration
  `20260830130000_add_catalog_description_entities`. It adds bounded JSONB
  `descriptionEntities` arrays to Product and ProductGroup with empty-array
  defaults for all existing rows. It does not rewrite product descriptions or
  modify wallet, payment, order, stock, delivery, credential, or customer
  values.
- The 2026-09-06 production rollout applied the four later additive migrations
  in order: `20260902223000_add_catalog_english_descriptions`,
  `20260905190000_add_shopee_partner_sessions`,
  `20260906120000_add_shopee_web_evidence_matching`, and
  `20260906150000_bind_qris_merchants_to_shopee_accounts`. The migration run
  reported success and a final `prisma migrate deploy` check reported no
  pending migrations. No transactional, stock, wallet, order, delivery, or
  customer rows were reset or recreated.
- The 2026-08-30 catalog rich-text/UX deployment used checkout maintenance,
  stopped both workers, created and verified a custom-format backup, tagged
  both prior images for rollback, applied only the additive migration, and
  recreated only the app plus the two stateless curl workers. Scheduler DNS
  did not recover after a plain container start, so both stateless workers were
  safely recreated to renew their Compose network attachment before checkout
  was reopened.
- Catalog rich-text deployment backup:
  `/opt/telegram-store/backups/pre-catalog-richtext-20260830T102300Z.dump`
  (39,997,044 bytes, SHA-256
  `11db0ed63cdd0eb2e3f62eae791d1901583c06b006ad9c0be2f7d02293122d4d`).
- Catalog rich-text rollback tags:
  `telegram-app:rollback-catalog-richtext-20260830T102300Z` and
  `telegram-migrate:rollback-catalog-richtext-20260830T102300Z`.
- Current production images:
  `telegram-app:production` =
  `sha256:3b1456a45b6d941458d3022091b744d6a2f9a3ecbe429ec4e7fbf4d75198ff1a`
  and `telegram-migrate:production` =
  `sha256:cca0cdad1dd6a0d1102a77a707fafadf38a5f2a3bcd1400f7cb063d4962c23c1`.
- The 2026-08-31 Telegram catalog-photo/product-warehouse deployment is
  app-only. It added no schema or migration and did not modify production
  product, stock, wallet, payment, order, delivery, or customer rows. Product
  and group images now render in Telegram detail, remain through quantity and
  payment-method selection, and fall back to text for definite invalid-media
  responses. The same deployment contains the compact `Gudang produk` admin UX.
- Catalog-photo deployment backup:
  `/opt/telegram-store/backups/pre-catalog-photo-ux-20260831T100841Z.dump`
  (40,347,203 bytes, SHA-256
  `3c0e7dd76810ab19ebc99eb6b785a36b4a31fe801a27bce6dee34a4044c333ea`).
- Catalog-photo rollback tag:
  `telegram-app:rollback-catalog-photo-ux-20260831T100841Z` =
  `sha256:097ef8401f3f1101d7837579de981a3547ae1cd891ea31888051cf8984793d2b`.
- Post-deploy verification used the real configured image for ChatGPT Business
  1 Bulan: its public active-catalog route returned HTTP 200 `image/webp`, a
  private Telegram admin-chat smoke successfully rendered the photo, then
  edited the same media message through quantity and payment-option callbacks.
  App/database health and both stateless workers remained healthy with no
  callback error log. Temporary image-transfer archives were removed.
- The 2026-08-31 admin editor/UX hotfix removes React-controlled
  `dangerouslySetInnerHTML` from the live contenteditable. Initial HTML is
  applied once per actual document signature; ordinary `onInput`, preview,
  counter, and hidden-field rerenders no longer overwrite what the operator is
  typing. CRLF text is canonicalized before entity offsets are applied.
- Rejected overlength input restores the last valid document and rebuilds a
  connected caret instead of retaining a Range into detached DOM nodes.
  Formatter buttons are disabled while Preview hides the editor.
- Product edit pages now put banned-stock policy and product-specific stock
  intake in a top operations grid. The detailed edit form is full width below
  it; safe sections use a responsive two-column grid on wide screens and
  collapse at 1120 px. The banned policy action now uses the reusable
  confirmation/processing modal.
- This hotfix has no schema change and ran no production migration. The app
  container and both stateless workers were recreated; PostgreSQL, its volume,
  Caddy, product data, stock, orders, payments, wallets, and customers were not
  rewritten or reset.
- Editor/UX hotfix backup:
  `/opt/telegram-store/backups/pre-editor-ux-hotfix-20260830T164644Z.dump`
  (40,142,496 bytes, SHA-256
  `e0ded4a2477cea823b30ef47b6c6700eb839c6300181ffcb2261890d1b507576`).
- Editor/UX rollback tag:
  `telegram-app:rollback-editor-ux-hotfix-20260830T164644Z` =
  `sha256:5c4b3ed275bf6e9dc25d8f244b529a54858d855134a914b7d4864c268faf5c30`.
- A production catalog/order incident immediately after the catalog-richtext
  deployment was contained by checkout maintenance and an emergency rollback.
  The incident build revalidated persisted descriptions strictly; legacy CRLF
  text or malformed-but-array-shaped entity metadata could throw and the
  callback handler masked the exception as `Permintaan belum dapat diproses`.
- The deployed hotfix canonicalizes CRLF/bare CR to LF before entity validation
  and makes only the catalog presentation path fail open: invalid persisted
  entity metadata is omitted and the readable description is sent as bounded
  plain text. Admin create/edit writes remain strict. Callback failures now
  emit a redacted action/error log instead of disappearing completely.
- Order hotfix backup:
  `/opt/telegram-store/backups/pre-order-hotfix-20260830T120500Z.dump`
  (40,002,324 bytes, SHA-256
  `e43216bc41891716327e65d98c6dde5bf08bf0e2786341ee2f1dd495be47622f`).
- Order hotfix rollback tag:
  `telegram-app:rollback-order-hotfix-20260830T120500Z` =
  `sha256:3214982d67c00eb0a169676be4e18b6693f29fb01a24f6d887fe5731a0e4b9bb`.
- Hotfix verification used real authenticated Telegram webhook updates against
  the admin chat: `/start`, the affected `product:<id>` detail callback, and
  `buy:<id>` quantity selection all returned HTTP 200. The new callback logger
  recorded no exception. Checkout was reopened only after app/db health,
  worker recreation, migration status, public health, and queue checks passed.
- Current hotfix operational state: checkout open; all 40 migrations current;
  app/db healthy; scheduler and notification worker running; bridge queue 0;
  outbox pending 0; no new delivery failure or manual-review increase. One
  unmatched bridge event shown in the one-hour monitoring metric predates the
  hotfix, was not auto-confirmed, and remains in ambiguity-safe review.
- Post-deploy verification: all 40 migrations are current, app/db are healthy,
  scheduler and notification worker are running, public health returns
  database `ready`, checkout maintenance is disabled, bridge queue is 0,
  outbox pending is 0, and rejected payment events in the last hour are 0.
  The pre-existing monitoring backlog remains 82 manual-review notifications
  and 11 exhausted notification retries; it did not increase during deploy.
- The temporary image-transfer archive was removed after verification. The
  verified backup and both rollback tags remain; VPS root-disk usage is 86%.
- Product image rendering, credential reveal-on-demand, password-hash-bound
  admin sessions, authenticated sensitive downloads, and Telegram ambiguous-
  outcome hardening are deployed together with the formatter and public-channel
  safeguards described above.
- The 2026-08-30 formatter deployment used global checkout maintenance, stopped
  both worker services, created and verified a production backup, tagged both
  rollback images, ran only `prisma migrate deploy`, recreated only the app,
  restarted workers, and disabled maintenance only after health and queue audit
  passed. Production already contained the re-engagement and custom-emoji
  migrations, so only the two 2026-08-29/30 migrations were newly applied.
- Formatter deployment backup:
  `/opt/telegram-store/backups/pre-telegram-formatter-20260830T040822Z.dump`
  (SHA-256
  `39a1993fc3445c673e277a4a6c5ff9eb2b6bad8d758daee70e5b97b6f018089f`).
- Formatter rollback tags:
  `telegram-app:rollback-telegram-formatter-20260830T040822Z` and
  `telegram-migrate:rollback-telegram-formatter-20260830T040822Z`.
- Previous production images before the catalog rich-text deployment:
  `telegram-app:production` =
  `sha256:3214982d67c00eb0a169676be4e18b6693f29fb01a24f6d887fe5731a0e4b9bb`
  and `telegram-migrate:production` =
  `sha256:d89aead3fb9fb2e643cade94470ddd44c07382287767c5c3f9abc35a0d2818ef`.
- Obsolete candidate tags and dangling image layers were pruned after rollback
  verification. The active production images and the dedicated formatter
  rollback tags remain present; VPS root-disk usage dropped from 96% to 84%.
- The multi-merchant QRIS migration is wrapped in an explicit PostgreSQL
  transaction and was validated by applying all 33 migrations to an isolated
  PostgreSQL 17 database before production deployment.
- Production health endpoint returns database `ready`.
- QRIS/DANA is enabled and currently uses the validated legacy environment
  fallback because no database merchant has been created yet. The first
  database merchant permanently switches QRIS management to the admin vault.
- Wallet checkout, wallet top-up, and Bank Jago are enabled.
- Backup before Jago top-up migration:
  `/opt/telegram-store/backups/pre-jago-wallet-topup-20260822T032732Z.dump`.
- Backup before Jago notification/recovery patch:
  `/opt/telegram-store/backups/pre-jago-notification-recovery-20260822T060327Z.dump`.
- Rollback tags:
  `telegram-app:rollback-jago-topup-20260822` and
  `telegram-migrate:rollback-jago-topup-20260822`.
- App rollback before notification/recovery patch:
  `telegram-app:rollback-jago-notification-recovery-20260822`.
- Reusable payment recovery/admin page split deployed on 2026-08-23 without a
  schema migration. Its previous production app image was
  `sha256:610836a6093a0bc2613484a40f5ad7ee0cd499d43dcbf3e590e998291de9df5f`.
- Backup before that deployment:
  `/opt/telegram-store/backups/pre-payment-recovery-refactor-20260823T005209Z.dump`
  (SHA-256 `dcfec382250763c3d818830982abe2b24dedc7288580de86b2b8a64adaac1651`).
- Rollback image before that deployment:
  `telegram-app:rollback-payment-recovery-refactor-20260823`.
- Multi-merchant QRIS, Shopee Partner adapter, and the clearer payment-settings
  UX were deployed on 2026-08-23. The images for that earlier deployment were:
  `telegram-app:production` =
  `sha256:78bcc88086468915e6094ec968e9b32ad432d5a2723a233ba5b9ef51d6dc0055`
  and `telegram-migrate:production` =
  `sha256:fbb05cd8a42ee503788ede4304f8bf21e63dd3ff88104b769783ad1f190ad9e7`.
- Backup before the multi-QRIS migration:
  `/opt/telegram-store/backups/pre-multi-qris-20260823T111350Z.dump`
  (SHA-256 `14f2608e94a3045356350b63026cb067f585617190bd9e879644087f28aee937`).
- Rollback tags:
  `telegram-app:rollback-multi-qris-20260823T111350Z` and
  `telegram-migrate:rollback-multi-qris-20260823T111350Z`.
- The explicit DANA/Shopee selector and legacy QRIS control were deployed later
  on 2026-08-23. The images for that deployment were:
  `telegram-app:production` =
  `sha256:3d03ebda23c17718ee0e220c39372ede1cf0e0cb7d7ca4d3b9ff081754ab0f3c`
  and `telegram-migrate:production` =
  `sha256:1aeed79bbef339cf4b489bc37072b9acdf25c7c44dbda093f41caadfc79258cf`.
- Backup before the selector deployment:
  `/opt/telegram-store/backups/pre-qris-shopee-selector-20260823T135402Z.dump`
  (SHA-256 `4b7a93dcbb574f255a547fcf493224346e664cb7f0bf0f8ae22aa98e2cfcd2ff`).
- Rollback tags:
  `telegram-app:rollback-qris-shopee-selector-20260823T135402Z` and
  `telegram-migrate:rollback-qris-shopee-selector-20260823T135402Z`.
- Product Groups / Variants production deployment:
  - Backup:
    `/opt/telegram-store/backups/pre-product-groups-20260824T064625Z.dump`
    (32,728,918 bytes, SHA-256
    `174352734ad70a22b083fd599d50b8fcc70a831d6109445f23cf20b6ce873720`).
  - Rollback tags:
    `telegram-app:rollback-product-groups-20260824T064625Z` and
    `telegram-migrate:rollback-product-groups-20260824T064625Z`.
  - Images immediately after that deployment:
    `telegram-app:production` =
    `sha256:4b1d2386a43172a05802789ab8681c42a62433f8d839534d0a74277323d01dcf`
    and `telegram-migrate:production` =
    `sha256:945a774393238b411f4893a52d31a6736ddfedcb6faabc6bc55eb3355d512ce6`.
  - Catalog backfill created four active parents and grouped 25 exact products:
    ChatGPT (19), Claude API (2), Multi-AI API Key (2), and AI Token Packages
    (2). Five products remain standalone. The transaction updated only
    `ProductGroup` and Product grouping fields; wallet, payment, order, and
    stock tables were not part of the mapping SQL.
- Only the `app` container was recreated. PostgreSQL, its persistent volume,
  scheduler, notification worker, and Caddy remained running.

Latest local validation for the QRIS legacy/DANA/Shopee selector:

```text
Tests           : 392 passed, 28 skipped
TypeScript      : passed
ESLint          : passed
Prisma validate : passed
Next.js build   : passed through the existing WASM SWC fallback
PostgreSQL test : all 34 migrations applied on disposable PostgreSQL 17
```

Latest local validation for Product Groups / Variants:

```text
Tests (default)   : 404 passed, 29 skipped
TypeScript        : passed
ESLint            : passed
Prisma validate   : passed
Next.js build     : passed through the existing WASM SWC fallback
PostgreSQL test   : all 35 migrations applied on disposable PostgreSQL 17
Product DB tests  : 5 passed
Load DB tests     : 3 passed in isolation
```

Latest local validation for Automated Telegram Re-engagement:

```text
Tests (default)   : 420 passed, 31 skipped
Reengagement DB   : 1 passed on disposable PostgreSQL 17
TypeScript        : passed
ESLint            : passed
Prisma validate   : passed
Next.js build     : passed through the existing WASM SWC fallback
PostgreSQL test   : all 36 migrations applied on disposable PostgreSQL 17
Docker app        : telegram-app:reengagement-candidate-20260824
Docker migrator   : telegram-migrate:reengagement-candidate-20260824
```

Latest local validation for Telegram Product Custom Emoji:

```text
Tests (default) : 442 passed, 31 skipped
TypeScript      : passed
ESLint          : passed
Prisma validate : passed
Next.js build   : passed through the existing WASM SWC fallback
PostgreSQL test : all 37 migrations applied on disposable PostgreSQL 17
Production DB   : untouched
```

Latest local validation for product media, post-delivery guidance, and local
security hardening:

```text
Tests           : 468 passed, 31 skipped
TypeScript      : passed
ESLint          : passed
Prisma validate : passed
Next.js build   : passed through the existing WASM SWC fallback
PostgreSQL test : not run; Docker Desktop/local PostgreSQL was unavailable
Production DB   : untouched
```

Latest local validation for the admin Telegram rich-text formatter:

```text
Tests           : 485 passed, 31 skipped
TypeScript      : passed
ESLint          : passed
Prisma validate : passed
Next.js build   : passed through the existing WASM SWC fallback
PostgreSQL test : all 39 migrations applied on disposable PostgreSQL 17
Candidate smoke : migrator passed and app became healthy on the disposable DB
Production      : deployed with verified backup, rollback tags, maintenance, and queue audit
```

Latest local validation for catalog rich text and the product workspace UX:

```text
Tests (default)  : 501 passed, 32 skipped
TypeScript       : passed
ESLint           : passed
Prisma validate  : passed
Next.js build    : passed through the existing WASM SWC fallback
PostgreSQL test  : all 40 migrations applied on disposable PostgreSQL 17
Product DB tests : 6 passed on the disposable database
Candidate smoke  : migrator passed and app image returned database ready
Desktop UI       : authenticated production product workspace verified
Mobile UI        : 390 px viewport, no horizontal overflow, toolbar wraps
Production       : deployed with maintenance, backup, rollback, health, worker, and queue audit
```

Latest validation for the Telegram catalog/order hotfix:

```text
Tests (default) : 505 passed, 32 skipped
Focused tests   : 31 passed for rich text, catalog rendering, and navigation
TypeScript      : passed
ESLint          : passed
Prisma validate : passed
Next.js build   : passed through the existing WASM SWC fallback
PostgreSQL      : all 40 migrations applied in disposable PostgreSQL 17
Docker smoke    : candidate app returned database ready
Telegram smoke  : /start, product detail, and quantity selector returned HTTP 200
Production      : hotfix deployed, workers healthy, checkout open
```

Latest validation for the admin rich-editor and product-workspace hotfix:

```text
Tests (default) : 511 passed, 32 skipped
Editor tests    : 6 passed in happy-dom
TypeScript      : passed
ESLint          : passed
Prisma validate : passed
Next.js build   : passed through the existing WASM SWC fallback
PostgreSQL      : all 40 migrations applied in disposable PostgreSQL 17
Docker smoke    : candidate app returned database ready
Production      : app/db healthy; scheduler and notification worker running
Schema change   : none
```

The editor interaction tests cover live typing persistence after React state
rerenders, hidden form synchronization, preview switching, actual prop-driven
reset, overlength rollback/caret recovery, CRLF entity offsets, and disabled
formatting controls in Preview. An automated authenticated production browser
smoke was not completed because the browser-control session reached the admin
login page after its session expired; do not treat that one check as complete.

The full opt-in DB suite reached 430 passed / 2 skipped, but running every DB
suite concurrently can exhaust the small disposable PostgreSQL connection pool.
The affected 100-operation load suite passes when run alone; this is a local
test-runner parallelism limit, not a production database result.

Latest validation for Telegram catalog photos and the compact product-warehouse
workspace:

```text
Tests (default) : 523 passed, 32 skipped
Focused tests   : 38 passed for media routes, photo API/navigation, caption bounds, and product flow
TypeScript      : passed
ESLint          : passed
Prisma validate : passed
Next.js build   : passed through the existing WASM SWC fallback
Schema change   : none
```

Latest production deployment for the full admin/Telegram UX and delivery audit
(2026-08-31):

```text
Tests (default) : 562 passed, 32 skipped
TypeScript      : passed
ESLint          : passed
Prisma validate : passed
Next.js build   : passed through the existing WASM SWC fallback
PostgreSQL test : all 40 migrations applied on disposable PostgreSQL 17
Docker smoke    : candidate app returned database ready
Schema change   : none
Production app  : sha256:4fbfd3ef4c5b0a609f2a54763d866ace7d76dd986813656a0bef3f593f4023ca
Rollback tag    : telegram-app:rollback-full-ux-delivery-20260831T124521Z
Rollback image  : sha256:21d75f569cb5c11e38e2ff417e2484868c5ff6bd65f23a928a3293a385befb7e
Backup          : /opt/telegram-store/backups/pre-full-ux-delivery-20260831T124521Z.dump
Backup bytes    : 40,480,711
Backup SHA-256  : f096161796f21f3f23e4d66207bccc3b706b4f255af685e08ebd475704ded28b
```

This app-only deployment adds deterministic rich-text formatting and always
visible previews, compact product/group workspaces, preserved dashboard and
inventory query/anchor state, complete Telegram callback return-state handling,
SMS search/cancel UX fixes, product-photo parent fallback, and an idempotent
post-delivery follow-up stage that explicitly orders attachment, guide, and
success notifications after all credential receipts are confirmed. AES-GCM
decrypt now rejects non-standard IV/tag lengths before entering Node crypto.

Production checkout maintenance was enabled before stopping scheduler and the
fast notification worker. A verified backup and rollback tag were created, only
the app image and two stateless workers were recreated, and no production
migration or direct database inspection was performed. Authenticated desktop
and 390 px mobile browser QA passed without horizontal overflow. A real private
admin-chat smoke returned HTTP 200 for `/start` and for a stock-zero product
detail whose image route returned HTTP 200 `image/png`. Monitoring remained at
outbox pending 0, manual review 84, failed notifications 11, ambiguous receipts
0, and rejected payment events 0. After checkout reopened, an additional
private admin-chat smoke returned HTTP 200 for product detail, `buy:`, and
`qty:` through payment-method selection without creating an order. Checkout
remained open after those checks.

Latest production deployment for stock-aware quantity `598` and bounded large
delivery (2026-09-01):

```text
Tests (default) : 586 passed, 34 skipped
TypeScript      : passed
ESLint          : passed
Prisma validate : passed
Next.js build   : passed through the existing WASM SWC fallback
PostgreSQL test : 598-unit direct-wallet and paid-preorder scenarios passed
Migrations      : all 40 applied on disposable PostgreSQL 17; production unchanged
Docker smoke    : candidate Linux app returned database ready
Schema change   : none
Production app  : sha256:5138e6d98649790ed12317b49d916e711bc743c180c2337d63e98858fb370311
Rollback tag    : telegram-app:rollback-quantity-598-20260901T090034Z
Rollback image  : sha256:4fbfd3ef4c5b0a609f2a54763d866ace7d76dd986813656a0bef3f593f4023ca
Backup          : /opt/telegram-store/backups/pre-quantity-598-20260901T090034Z.dump
Backup bytes    : 40,804,480
Backup SHA-256  : f7bfa0d1570e409cf58a5a4d5e862ccd150cb238568b0f33af48198a563ac81f
```

The hard per-order ceiling is now 750 and the advertised maximum is further
bounded by product price, current healthy stock, reservations, and preorder
capacity. The production product `ChatGPT Codex JSON (Free Plan + Mail))` was
verified through the authenticated admin UI with exactly 598 ready files at
Rp3,500, so quantity 598 is now eligible. Delivery claims and finalizes at most
100 credentials per bundle (`100+100+100+100+100+98` for 598); K12/TXT remains
combined and generic or mixed stock uses deterministic ZIP ranges. Payment and
preorder allocation now batch item-to-stock assignments instead of issuing one
query per credential.

Checkout maintenance was enabled through the authenticated admin route before
both stateless workers were stopped. A verified custom-format backup and app
rollback tag were created, the app and both workers were recreated, and no
production migration or direct database inspection was performed. Public
health returned database ready; monitoring remained at bridge queue 0, outbox
pending 0, manual review 85, failed notifications 11, delivery failures 0,
ambiguous receipts 0, and rejected payment events 0. Checkout was then reopened.

Latest production deployment for preserved admin form drafts and reusable
Radix dialogs (2026-09-02):

```text
Tests (default) : 596 passed, 34 skipped
TypeScript      : passed
ESLint          : passed
Prisma validate : passed
Next.js build   : passed through the existing WASM SWC fallback
Docker smoke    : all 40 migrations on disposable PostgreSQL 17; database ready
Schema change   : none
Production app  : sha256:2484dfcd7c68086105db1bd92b1fe66af10a309357d34afc6b26c4902220354c
Rollback tag    : telegram-app:rollback-admin-form-drafts-20260902T072023Z
Rollback image  : sha256:5138e6d98649790ed12317b49d916e711bc743c180c2337d63e98858fb370311
Backup          : /opt/telegram-store/backups/pre-admin-form-drafts-20260902T072023Z.dump
Backup bytes    : 41,027,772
Backup SHA-256  : 302c0b975e1af6fa220f53e28675b46e5cc8b00f6929d82a67a2356464f28c48
```

This app-only deployment adds `@radix-ui/react-dialog`, one reusable admin
dialog adapter, asynchronous multipart admin form responses, and controlled
result dialogs. Product create/edit/variant and redeem-description validation
failures now keep the mounted form, rich-text state, image/attachment inputs,
and previews intact. Native non-JavaScript redirect fallback remains supported.
No production migration ran, and the PostgreSQL service/volume, Caddy, and
migrator image were not recreated. Only `app`, `scheduler`, and
`notification-worker` were recreated. Public health returned database ready;
the app remained healthy with zero restarts; Telegram webhook registration had
zero pending updates and no last error; unauthenticated webhook access remained
HTTP 401. Authenticated production UI smoke verified the product dialog opens
and closes with Escape and the redeem reset dialog opens/cancels without a
mutation. Post-deploy monitoring showed bridge queue 0, outbox pending 0,
delivery failed 0, ambiguous delivery 0, expired backlog 0, manual review 86,
failed notifications 11, and one rejected payment event in the one-hour window.

The stock-upload processing modal hotfix was deployed later on 2026-09-02:

```text
Tests (default) : 601 passed, 34 skipped
Focused tests   : 13 passed for stock upload and preserved admin forms
TypeScript      : passed
ESLint          : passed
Prisma validate : passed
Next.js build   : passed through the existing WASM SWC fallback
Docker smoke    : disposable PostgreSQL 17; database ready
Schema change   : none
Production app  : sha256:c7a2e27b10f6c392df0499cd6fbc3f1d157072be03fd4bbdbec432d281f1a7d5
Rollback tag    : telegram-app:rollback-stock-upload-modal-hotfix-20260902T075518Z
Rollback image  : sha256:2484dfcd7c68086105db1bd92b1fe66af10a309357d34afc6b26c4902220354c
Backup          : /opt/telegram-store/backups/pre-stock-upload-modal-hotfix-20260902T075518Z.dump
Backup bytes    : 41,127,577
Backup SHA-256  : 9f921b5c6c98d22a047f5e06a1b8f078d9cb3d9743e58badc1420c2792267bd6
```

The previous stock upload confirmation closed and immediately triggered a
native multipart navigation. Chrome could paint the full-page blur before the
inline processing card stabilized, producing a blurred page without a usable
modal. Stock upload now uses the same asynchronous `FormData`/JSON contract as
product forms, confirmation uses `AdminDialog`, and the non-dismissible
processing state uses a Radix Portal with sibling overlay/content layers.
Failures keep the file input, estimate, and product selection mounted for
retry; native non-JavaScript requests still receive the existing redirect.
Production received no migration or test stock. PostgreSQL, its volume, Caddy,
and the migrator were not recreated. App and both stateless workers were
recreated, remained healthy with zero app restarts, and showed no new
Prisma/worker/network errors after a full scheduler observation window.

The result-modal positioning CSS hotfix was deployed later on 2026-09-02:

```text
Tests (default) : 602 passed, 34 skipped
Focused tests   : 6 passed for dialog CSS and preserved forms
TypeScript      : passed
ESLint          : passed
Prisma validate : passed
Next.js build   : passed in the Linux Docker image
Schema change   : none
Production app  : sha256:74c2b189b3e616c20acc9d54bd705dc684e58bf9642d2b3f0f409040878f5f3f
Rollback tag    : telegram-app:rollback-result-modal-position-hotfix-20260902T082643Z
Rollback image  : sha256:c7a2e27b10f6c392df0499cd6fbc3f1d157072be03fd4bbdbec432d281f1a7d5
Backup          : /opt/telegram-store/backups/pre-result-modal-position-hotfix-20260902T082643Z.dump
Backup bytes    : 41,170,880
Backup SHA-256  : 929b2b7966105bf6210194dbb62a50bdb3e63e39ab86f50e9e30a33dda3e74a7
```

The shared `.admin-dialog-content` correctly declared `position: fixed`, but a
later equal-specificity `.result-modal { position: relative }` rule overrode
it and returned error/result cards to document flow near the page bottom. The
override was removed and a CSS regression test now guards it. Authenticated
production verification opened a query-only error result without mutating
stock: computed position was `fixed`, its 470 x 336 px rectangle was fully
inside the 1536 x 770 viewport, and both horizontal and vertical center deltas
were exactly zero. No migration or test stock was created.

The product-status and USDT BEP20 QR deployment was completed later on
2026-09-02:

```text
Tests (default) : 622 passed, 34 skipped
Focused tests   : 45 passed for BEP20 QR/navigation/expiry; product status is covered by the full suite
TypeScript      : passed
ESLint          : passed
Prisma validate : passed
Next.js build   : passed locally and in the Linux Docker image
Schema change   : none
Production app  : sha256:1db00c885a8f44af37a36b760968c0d17ef4821e0da885d9c14ad54f9d9a51bd
Rollback tag    : telegram-app:rollback-product-status-bep20-qr-20260902T152044Z
Rollback image  : sha256:74c2b189b3e616c20acc9d54bd705dc684e58bf9642d2b3f0f409040878f5f3f
Backup          : /opt/telegram-store/backups/pre-product-status-bep20-qr-20260902T152044Z.dump
Backup bytes    : 44,167,223
Backup SHA-256  : 6e1074d3c65b8914c24b7bc91e5bb8700db6ec47e6e8620348b178f64e11b0c4
```

Checkout maintenance was enabled before the app and stateless workers were
recreated. The verified custom-format backup and app rollback tag were retained.
Compose reran the existing `prisma migrate deploy` dependency check, but there
was no new migration or schema mutation. PostgreSQL, its volume, Caddy, stock,
wallet, and historical orders were not recreated or reset.

The status action now uses the reusable asynchronous Radix dialog contract,
returns stable operator errors, preserves native redirect fallback, locks
against concurrent checkout, and cannot be undone by a stale product edit tab.
`INACTIVE` blocks new catalog/checkout access but intentionally preserves
already-created invoices and all historical records.

USDT BEP20 is configured through the production admin setting without exposing
the wallet address in repository files. New crypto invoices use a 30-minute
payment window, an immutable address/token/rate/confirmation snapshot, a local
1024 px high-redundancy address QR, copy buttons, and one navigation bubble.
Transaction hashes remain mandatory and are verified against BSC chain ID 56,
the locked token contract, exact token units, recipient, block time, uniqueness,
and required confirmations. A definite Telegram PNG rejection falls back once
to complete text instructions; an ambiguous upload never sends a duplicate
fallback.

Post-deploy checks returned database ready, unauthenticated webhook HTTP 401,
app healthy with zero restarts, scheduler and notification worker running with
zero restarts, bridge queue 0, outbox pending 0, delivery failed/ambiguous 0,
expired backlog 0, and rejected payment events 0. One new manual-review row was
a buyer-submitted `DELIVERY_MISSING_REPORT`, not a deploy or BEP20 verifier
failure. Checkout was reopened and USDT BEP20 was enabled only after those
checks passed.

## Catalog Multilanguage (implemented and deployed 2026-09-06)

The local candidate adds reviewed Indonesian/English catalog content without
rewriting existing products:

```text
Product/ProductGroup description          : required Indonesian/default
Product/ProductGroup descriptionEntities  : Indonesian Telegram entities
Product/ProductGroup descriptionEn        : nullable reviewed English text
Product/ProductGroup descriptionEntitiesEn: separate English Telegram entities
English translation missing/invalid       : Indonesian fallback
```

Migration `20260902223000_add_catalog_english_descriptions` is additive only.
It adds the four English catalog columns and JSON-array constraints; it does
not update, delete, or backfill product, stock, order, wallet, payment, or
delivery rows. All 41 migrations applied successfully to disposable PostgreSQL
17 and the product database integration suite passed `6/6`. The production
database received this additive migration during the 2026-09-06 rollout.

Product and group create/edit forms use one reusable bilingual rich-text
component. Indonesian is required; English is optional and remains a separate
draft/editor so UTF-16 Telegram entity offsets cannot mix across languages.
Product group submission now uses the same enhanced async form contract as
products, keeping both drafts on screen after a validation/network failure.

The Telegram catalog list, search, group view, product detail, quantity flow,
invalid selection states, product announcement, restock, and sold-out notices
read `BotSession.locale`. English search includes English product/group
descriptions. Product announcements resolve locale per recipient. Existing
products remain visible to English users through Indonesian fallback.

Automatic machine translation is intentionally not enabled yet: no official
translation provider or server-side credential is configured. English can be
entered and reviewed manually. A future provider integration must only return
an editable draft, must never translate at catalog read time, and must rebuild
English formatting rather than reuse Indonesian entity offsets.

Candidate validation:

```text
Tests             : 631 passed, 34 skipped
Focused i18n tests: 58 passed
PostgreSQL tests  : 6 passed on disposable PostgreSQL 17
TypeScript        : passed
ESLint            : passed
Prisma validate   : passed
Next.js build     : passed (Windows SWC/cache warnings; Webpack fallback compiled)
Production deploy : included in the 2026-09-06 rollout
```

## Payment / Language Audit (implemented and deployed 2026-09-06)

See `PAYMENT_LANGUAGE_AUDIT.md` for the current audit, validation and activation
requirements. Binance Pay now accepts numeric receipt / `M_P_` aliases with
serialized reuse protection, validates the API success envelope, and includes
localized invoice copy buttons. USDT BEP20 stale-result state updates and worker
error isolation are hardened. Checkout/payment selection, order screens and
active-invoice error recovery have expanded Indonesian/English support.

Production checks found the Binance API key/secret absent. BSC public RPC
connectivity and public health passed. The code was deployed with no real
payment, Binance credential, or provider activation performed. The catalog
English migration above was applied in the same additive rollout. Broader
wallet/referral/SMS/redeem localization remains incomplete.

## Shopee Partner Cookie Polling (deployed fail-closed foundation 2026-09-06)

- The verified request is an exact `POST` to
  `https://shopeepay.shopee.co.id/merchant/v1/partner-web/get-transaction-list`.
  The code owns this URL; there is no configurable Shopee transaction host.
- Requests use a bounded Jakarta-time window, `serviceList` `[1, 3]`, newest-
  first `createTime` sorting, bounded page size/cursor, applicable target
  cookies only, and the separately supplied `metadata.token`.
- Cookie JSON and the API/session token are encrypted separately with
  `PAYMENT_SESSION_ENCRYPTION_KEY`. Only one-way fingerprints appear under
  `/admin/payment-settings/shopee`; revoke scrubs both ciphertext payloads.
- New sessions start as `PENDING_VALIDATION`. Polling uses a database-backed
  lease so concurrent cron runs cannot use one session simultaneously.
- Transaction uniqueness is account-scoped as
  `(merchantAccountFingerprint, externalTransactionId)`, surviving ordinary
  cookie/session rotation. An `ACTIVE` session must have a derived stable
  merchant account fingerprint.
- The verified response parser requires `code: 0`, a `data.list` envelope,
  consistent `merchantId` + `storeId`, valid epoch/amount/ID fields, completed
  status `3`, incoming `transactionType` `1`, and service `1` or `3`. Indonesian
  grouped amounts such as `85.039` become the exact integer `85039`.
- The application hashes each raw row locally, stores the numeric Shopee
  `transactionId` as the canonical provider key, retains the alphanumeric
  `externalTransactionId` separately, and derives the account fingerprint from
  merchant/store IDs. Pagination is bounded and resumes from `next_position`.
- A valid page can activate a session for read-only polling. A QRIS invoice is
  still `ANDROID_NOTIFICATION` by default. The explicit `WEB_SESSION` mode
  requires an active validated Shopee session and snapshots its session ID and
  merchant-account fingerprint on the invoice. The matcher then requires the
  same account fingerprint, exact amount, and invoice time window, binding at
  most one normalized transaction to one invoice in a transaction. Zero
  candidates become `UNMATCHED`; more than one becomes `AMBIGUOUS`.
- Shopee QRIS merchant records optionally bind a static payload to a validated
  account fingerprint. The admin form submits only a session ID, the server
  resolves the fingerprint from the active session, and `WEB_SESSION` refuses
  unbound or mismatched accounts. Android-notification mode remains compatible
  with an unbound Shopee merchant.
- Matching is evidence collection, not payment confirmation. Order and wallet
  confirmation revalidate the bound transaction, status, amount, account,
  provider, and time window and then transition both records atomically. No
  checkout caller enables `WEB_SESSION` by default. Even an explicitly
  snapshotted web invoice remains confirmation-gated by
  `SHOPEE_WEB_SESSION_AUTO_CONFIRM=false` until the status contract and a
  controlled cutover are reviewed. Android notification evidence remains the
  production source.
- Concurrent idempotent checkout/top-up retries revalidate the evidence mode
  and session snapshot inside the creation transaction. Bound rows whose
  invoice expires/cancels are closed as rejected; rows whose invoice is already
  confirmed are reconciled, avoiding endless confirmation retries.
- Settings and the read-only ledger are split between
  `/admin/payment-settings/shopee` and `/admin/payments/shopee`. Mutations use
  stable redirect notice/error codes and never surface upstream exceptions.
- Polling is exposed at `/api/cron/payments/shopee`; matching/confirmation is a
  separate `/api/cron/payments/shopee/match` job so slow upstream pages cannot
  consume the confirmation worker's route budget. The match job is not added to
  the production scheduler until the controlled cutover is authorized.
- The four Shopee/catalog migrations were applied successfully to a fresh
  disposable PostgreSQL 17.5 PGlite database with `pg_trgm` and then to
  production during the 2026-09-06 rollout. No real Shopee credential or
  transaction was entered. Polling/matching remains fail-closed: the matching
  job is not in the production scheduler, web-session auto-confirm remains
  disabled, and Android notification evidence remains the production source
  until a separately authorized, audited cutover.

## Production Rollout (2026-09-06)

The delivery follow-up fix and the catalog/Shopee safety foundation were
released to the Azure Compose stack under deployment ID
`delivery-followup-shopee-20260906T090346Z`.

```text
Local tests          : 127 files; 721 passed, 41 skipped
TypeScript / lint    : passed
Prisma validate      : passed
Next.js build        : passed (Windows WASM SWC fallback)
Docker runner        : built and smoke-tested
Docker migrator      : built and smoke-tested
Disposable DB smoke  : all 44 migrations; database ready; webhook POST 401
Applied migrations   : 20260902223000, 20260905190000,
                       20260906120000, 20260906150000
Production app       : sha256:de99cae6b2f2c3225334d56160e50b7c69cce44f896a289fb3e839109f7ba38e
Production migrator  : sha256:9f9b3676c06c764510ec92ff12ba4619dcb33e5748f8ad5d3b7afe87d6c97734
Backup               : /opt/telegram-store/backups/pre-delivery-followup-shopee-20260906T090346Z.dump
Backup bytes         : 46,486,398
Backup SHA-256       : 2bbc58d2a695306bfbd9863833c7ed867f922b0615d1d9419b78de155402aed9
App rollback tag     : telegram-app:rollback-delivery-followup-shopee-20260906T090346Z
Migrator rollback    : telegram-migrate:rollback-delivery-followup-shopee-20260906T090346Z
App rollback image   : sha256:1db00c885a8f44af37a36b760968c0d17ef4821e0da885d9c14ad54f9d9a51bd
Migrator rollback    : sha256:1e4370570105ff2e0dca068f3afc7fe982b1700a8d2282f93413af996d2c2f70
Checkout maintenance : enabled before backup/workers; disabled after audit
Final public health  : database ready; unauthenticated webhook POST 401
Final containers     : app/db healthy; scheduler/notification-worker running;
                       all restart counts 0
Final audit          : bridge queue 0; outbox pending 0; manual review 88;
                       failed notifications 11; delivery failed/ambiguous 0;
                       expired backlog 0; rejected events (1h) 0
Shopee credentials   : none entered at that rollout; no web-session payment cutover
```

The production PostgreSQL volume, Caddy, stock, wallet, order, payment,
delivery, and customer records were preserved. The temporary image archive was
checksum-verified on the VPS and removed after loading. The eager delivery
fan-out now preserves the buyer sequence `credential -> attachment -> private
guide -> success channel`; the idempotent follow-up row remains the crash-
recovery fallback.

## Shopee Contract Fix Rollout (2026-09-06)

The follow-up Shopee Partner polling fix was deployed after the supplied
merchant session was entered through the authenticated admin page. The poller
now uses the verified portal contract (`metadata`, `time_period`, `page_size`,
`transaction_status_list`, and `transaction_type_list`), omits an empty cursor,
and sends the portal origin/referer plus browser-compatible timestamp headers.
The encrypted session remains read-only evidence; `WEB_SESSION` auto-confirm is
still disabled and Android notification evidence remains the normal payment
source.

```text
Production app       : sha256:87a02659490d94d8c1f5293ddbd183a34158c3e2c44abfcfcf96966215bb5c5d
Rollback image       : telegram-app:rollback-shopee-contract-20260906T120326Z
Rollback digest      : sha256:de99cae6b2f2c3225334d56160e50b7c69cce44f896a289fb3e839109f7ba38e
Backup               : /opt/telegram-store/backups/pre-shopee-contract-20260906T120326Z.dump
Backup bytes         : 46,829,567
Backup SHA-256       : 95311043fcc9556fb3a47f3aceb7f223b508ebe86bb8ec3dec4795eba721fbe8
Schema               : unchanged; migrator reported no pending migrations
Checkout maintenance : enabled before replacement; disabled after audit
```

Post-deploy cron smoke returned `sessions=1`, `pages=3`,
`contractUnknown=0`, `unauthorized=0`, and `errors=0`; the first bounded poll
persisted 15 read-only evidence rows and a repeated poll persisted zero
duplicates. The admin session is `ACTIVE` with no safe error, and monitoring
showed bridge queue 0, outbox pending 0, rejected payment events (1h) 0,
delivery failed/ambiguous 0, and expired backlog 0. Public health returned
database `ready`; app, database, scheduler, and notification worker remained
healthy with zero app restarts. The temporary image archive was removed from
both workstation and VPS; the verified backup and rollback tag remain.

Read-only polling is now enabled in the production scheduler at a 30-second
interval (`/api/cron/payments/shopee`). A smoke poll immediately before the
change returned `sessions=1`, `pages=3`, `received=0`, and no authorization,
contract, or upstream errors. The scheduler was recreated without touching the
database volume; its pre-change Compose file is backed up at
`/opt/telegram-store/backups/pre-enable-shopee-polling-20260906T125050Z.yml`.
That initial polling-only state was later superseded by the controlled web
session test cutover recorded below.

## Shopee Web-Session Test Cutover (2026-09-07)

The checkout path now supports an explicit
`SHOPEE_WEB_SESSION_CHECKOUT_ENABLED` switch. When it is enabled and the active
QRIS merchant is a bound Shopee Partner merchant, new QRIS order and wallet
top-up invoices automatically snapshot the newest active validated session for
that same merchant account. DANA and unbound/legacy QRIS invoices keep their
Android-notification behavior. The invoice still uses the normal payment
expiry and globally locked unique-code allocator.

The production app was rebuilt and deployed with both
`SHOPEE_WEB_SESSION_CHECKOUT_ENABLED=true` and
`SHOPEE_WEB_SESSION_AUTO_CONFIRM=true`. The matching route now runs every 30
seconds alongside polling. Before opening auto-confirm, a baseline matching
run scanned 18 historical Shopee rows and returned `matched=0`,
`ambiguous=0`, `confirmed=0`, and `errors=0`; the post-gate run returned the
same counts with `autoConfirmEnabled=true`. No historical row was attached to
an invoice or confirmed by the cutover.

```text
Production app image : sha256:e97fa39600241929a78a31665dd4481944b057192fd4cf19652f6d3b17983fa9
Rollback tag         : telegram-app:rollback-shopee-web-test-20260906T170222Z
App/worker restart   : app and scheduler only; database volume preserved
Health               : public database ready; app and scheduler healthy
Config backup        : /opt/telegram-store/backups/pre-shopee-web-test-20260906T170222Z.env.production
Compose backup       : /opt/telegram-store/backups/pre-shopee-web-test-20260906T170222Z.docker-compose.yml
```

The first real checkout payment is still the live test point: exact amount,
bound merchant account, completed incoming transaction, and invoice expiry
must all pass before fulfillment. Keep monitoring the Shopee ledger and order
status while this test is running.

## Telegram UX Cleanup (2026-09-07)

- Product/category rows now use Telegram's native button styles: green for ready,
  blue for preorder/temporary states, and red for unavailable states. Custom
  emoji icons are limited to product/category identity; action, status, payment,
  navigation, and delivery controls stay plain.
- Quantity selection keeps preset buttons but puts the chat directly in numeric
  input mode, so buyers can type `7` immediately without a custom-quantity step.
- Delivery acknowledgement now returns a short confirmation with optional order
  details instead of opening the full order screen automatically. Missing-file
  reports use the same compact recovery screen.
- Delivery captions and private guides were shortened by removing decorative
  duplicate icons. QRIS setup failures now explain when the Shopee merchant or
  session binding is not ready instead of falling through to a generic error.
- Admin now has `/admin/telegram` for numeric Premium custom-emoji IDs for
  ChatGPT/Claude branding plus catalog/product identity.

```text
Production app image : sha256:d14699ea8bb05f67e93fc0ffeefc43cdd554d2a9b1ec27553c600b23be2517e3
Rollback tag         : telegram-app:rollback-telegram-ux-20260906T182412Z
Schema               : unchanged; app-only deployment
Public health        : database ready; app restart count 0; scheduler restart count 0
```

### Shopee web-session rollback (same test window)

The first QRIS retry after the UX deployment exposed a missing production
binding: `Merchant QRIS Shopee belum diikat ke akun Shopee Partner`. To restore
ordinary QRIS immediately, `SHOPEE_WEB_SESSION_CHECKOUT_ENABLED` and
`SHOPEE_WEB_SESSION_AUTO_CONFIRM` are now both `false`. New invoices use the
existing Android-notification evidence path; no schema or transactional data
was changed. The pre-rollback environment is retained at
`/opt/telegram-store/backups/pre-disable-shopee-web-checkout-20260906T183212Z.env.production`.
The web-session cutover must not be re-enabled until the active Shopee QRIS
merchant is bound to the validated session/account.

### Shopee binding completed (2026-09-07)

The authenticated admin UI was used to bind the active `ShopeePay QRIS Utama`
merchant to the already validated `Shopee Partner - Build With Reys` session
(`merchant 22669496 / store 23556014`). The merchant page now shows a masked
web-session fingerprint instead of `Belum diikat`. After a clean baseline
(`matched=0`, `ambiguous=0`, `confirmed=0`, `errors=0`), both
`SHOPEE_WEB_SESSION_CHECKOUT_ENABLED` and
`SHOPEE_WEB_SESSION_AUTO_CONFIRM` were enabled again. Public health remains
database `ready`; the next invoice must be newly created after this binding.

### Shopee refresh and Android fallback deployment (2026-09-07)

The app now shows `Refresh pembayaran Shopee` on pending Shopee orders. The
button runs an on-demand cookie/session poll followed by matching and refreshes
the order bubble with a specific result. New web-session invoices use Shopee
cookie evidence as the primary source; a validated Android Shopee event remains
an explicit fallback for a web invoice. Legacy Android-snapshot invoices are
not silently converted to web evidence, and expired invoices are routed to
wallet/admin recovery instead of being fulfilled late.

```text
Production app image : sha256:54c2005322419fd09a54638c674c2c6771edafc8d2ed25d662d99401583171c5
Rollback tag         : telegram-app:rollback-shopee-refresh-20260906T192251Z
Flags                : WEB_SESSION checkout=true; auto-confirm=true; Android fallback=true
Health               : database ready; app restart count 0
Schema               : unchanged; app-only deployment
```

### Shopee cursor/targeted-refresh fix (2026-09-07)

The prior worker could persist a pagination cursor behind newly inserted
transactions, while the refresh action delegated to the global oldest-first
matcher. The deployed fix always begins routine polling from the newest page,
uses a bounded 24-hour/cursor-reset lookback for buyer refresh, and targets only
the invoice whose button was pressed. Android remains an explicit fallback;
Shopee cookie/session evidence is primary. Expired invoices remain recovery-only.

```text
Production app image : sha256:3e9bfdff632c2fc24644a4771209ac8e16319740a90fd9552ae39e0ef5999e07
Rollback tag         : telegram-app:rollback-shopee-cursor-fix-20260907T035136Z
Validation           : 127 test files; 730 passed; 41 skipped; TypeScript/lint passed
Smoke                : polling pages=3/errors=0; matching ambiguous=0/errors=0
Maintenance          : enabled for deployment; disabled after health/smoke passed
```

The final follow-up orders global matching by newest transaction first so a
growing historical `UNMATCHED` backlog cannot starve current payments. Targeted
refresh also fails closed when more than one Shopee transaction has the same
amount inside the invoice window.

```text
Final production app : sha256:39e68bc9c0df46bccd78259506f253de980c1dba3e9ab7e39e2f5e14347e4f62
Final rollback tag   : telegram-app:rollback-shopee-newest-20260907T041255Z
Health / restarts    : database ready; app restart count 0
```

### Shopee web-primary constraint fix (2026-09-07)

Production logs exposed the exact reason web-session refresh could never bind a
transaction: `QrisAttempt_match_pair_check` requires `matchedAt` to be paired
with a bridge `matchedEventId`. The Shopee matcher wrote `matchedAt` even though
its evidence lives in `ShopeePartnerTransaction`, so PostgreSQL correctly
rolled the whole match back with SQLSTATE `23514`.

The matcher now changes only the attempt status to `MATCHED`; the bound Shopee
transaction is the immutable web evidence and receives its own confirmation
state. No schema relaxation or production migration was needed. Android Shopee
events now wait through a 90-second server grace period (configurable with
`SHOPEE_ANDROID_FALLBACK_DELAY_SECONDS`, bounded to 30-240 seconds). The signed
event remains in the Android durable queue through `503 + Retry-After`, giving
the 30-second cookie poll/matcher first priority; Android confirms only if web
evidence still has not succeeded after the grace period. The same policy covers
product orders and wallet top-ups.

```text
Tests                  : 129 passed files, 18 skipped; 735 passed, 41 skipped
TypeScript / ESLint    : passed
Prisma validate        : passed
Next.js / Linux Docker : passed
Disposable DB smoke    : all 44 migrations; database ready
Production app image   : sha256:928ef3a93cb4156f3772b4c780d614a8aa33b6d2387d65e240832ef3950d2de5
Rollback app image     : telegram-app:rollback-shopee-primary-fix-20260907T151835Z
Rollback app digest    : sha256:39e68bc9c0df46bccd78259506f253de980c1dba3e9ab7e39e2f5e14347e4f62
Backup                 : /opt/telegram-store/backups/pre-shopee-primary-fix-20260907T151835Z.dump
Backup bytes / SHA-256 : 47,166,938 / df76ddc7e3f6742a9c8c554a22dc35edb88ee56eeb37e3fd387a3e5904536ab1
Schema                  : unchanged; migrate deploy reported no pending migrations
Post-deploy poll        : sessions=1; pages=3; errors=0
Post-deploy match       : scanned=25; ambiguous=0; rejected=0; errors=0
Final health            : database ready; app healthy; restart count 0
Maintenance             : enabled before backup/replacement; disabled after audit
```

The PostgreSQL container was recreated by the normal Compose dependency check,
but its persistent volume was preserved and no schema/data reset, reseed, or
destructive SQL occurred. Old Android-confirmed transactions remain historical
`UNMATCHED` evidence; the next newly created and paid Shopee invoice is the
controlled proof that web-session confirmation now wins before fallback.

### Digital document entity/refund incident hotfix (2026-09-07)

Production returned the exact Telegram response `400 Bad Request:
ENTITY_TEXT_INVALID` for `sendDocument` delivery captions. The previous fallback
recognized verbose UTF-16/custom-emoji errors but not this short Telegram error,
so the worker classified the HTTP 400 as a definite file failure and immediately
credited the paid order back to wallet. The credential file itself and available
stock were not the cause.

Critical credential and attachment deliveries now use plain captions with no
Telegram entities. `sendDocument` still sends the same binary file, filename,
caption text, and buttons; when Telegram rejects entity/button decoration with a
definite 400, it retries the same document once without caption entities and
without custom button decoration. A residual entity-format error is recorded as
a safe failed delivery for admin retry and is explicitly forbidden from
triggering an automatic wallet refund.

```text
Tests                  : 129 passed files, 18 skipped; 738 passed, 41 skipped
TypeScript / ESLint    : passed
Prisma / Next.js build : passed
Linux Docker build     : passed
Production app image   : sha256:549e364307c0b8890119038c22f2f677c7104d4744af67fb221449761c822d70
Rollback tag           : telegram-app:rollback-delivery-entity-fallback-20260907T125632Z
Rollback digest        : sha256:928ef3a93cb4156f3772b4c780d614a8aa33b6d2387d65e240832ef3950d2de5
Backup                 : /opt/telegram-store/backups/pre-delivery-entity-fallback-20260907T125632Z.dump
Backup bytes / SHA-256 : 47,235,591 / f5b3664fa9b7ba6b2afd86395aa4eac81bdc98f5e0a2fef4ab9d2025504b66e7
Schema                  : unchanged; no production migration
Runtime                 : app/database healthy; app restart count 0
Shopee smoke            : poll errors=0; match errors=0
Incident audit          : 19 failed DIGITAL_FILE notifications across 6 invoices;
                          14 failed receipts; 0 ambiguous receipts
Maintenance             : remains enabled pending one controlled post-fix file delivery
```

All audited incident orders were already refunded before containment, and their
reserved stock was released by the existing idempotent refund transaction. They
must not be blindly retried because the order is financially terminal. The next
controlled purchase can use the refunded wallet balance after checkout is
temporarily reopened for validation.

The final defense-in-depth follow-up replaces the former broad permanent-error
refund rule with a strict recipient-unreachable allowlist. Automatic delivery
refund is now permitted only when Telegram explicitly returns a definite private
recipient failure such as `chat not found`, `bot was blocked by the user`, or
`user is deactivated`. Entity, button, file-size, bot configuration, crypto,
database, application, network, and Telegram 5xx failures cannot refund or
release stock. Accepted uploads, ambiguous outcomes, and accepted-upload commit
failures continue to use `SENT` or `UNKNOWN`, both of which block refund.

```text
Final production app : sha256:7b5f07426829fac476b48f4f86960d7a53537641efd11ea2f41843fd7507283a
Rollback tag         : telegram-app:rollback-delivery-refund-allowlist-20260907T131439Z
Rollback digest      : sha256:549e364307c0b8890119038c22f2f677c7104d4744af67fb221449761c822d70
Backup               : /opt/telegram-store/backups/pre-delivery-refund-allowlist-20260907T131439Z.dump
Backup bytes/SHA-256 : 47,236,306 / 3aab03e7716355222324d24d4e3d1a487bfdc7b6d7756b5f0ce5cd03abefa9f8
Post-deploy          : app healthy; restart count 0; no new delivery/refund error log
Maintenance          : still enabled pending controlled buyer file receipt
```

## Binance Web-Session Foundation Rollout (2026-09-08)

The fail-closed Binance-to-Binance verifier foundation was deployed under
`binance-web-foundation-20260908T101500Z`. Migration
`20260908103000_add_binance_web_sessions` applied successfully and a repeat
`prisma migrate deploy` reported all 45 migrations current. PostgreSQL kept the
same `telegram-store_telegram_store_postgres` volume; no reset, truncate, seed,
restore, or direct customer/payment row inspection occurred.

```text
Production app       : sha256:3debcde39e059a6bdc0660f6021759ec2755d210912a4196a8be7f53cbbfcd7d
Production migrator  : sha256:a814d1de1289e061102a09e612df6abeff9977c9ffaadfa529b25f75803e8a64
Local app candidate  : sha256:9b914b0ffa876c8b7970fe7de5f2353a6954f56fc79b3d7fc7afa74bba0c8daa
Local migrator       : sha256:8dfa28044eee7828e0272831add7e880f082c1893f144a49c4da44013760693e
Backup               : /opt/telegram-store/backups/pre-binance-web-foundation-20260908T101500Z.dump
Backup bytes         : 49,164,302
Backup SHA-256       : 936facae9313828fafb9fa1f78e2e6cbc93779840501861a980e825d11f5f650
App rollback tag     : telegram-app:rollback-binance-web-foundation-20260908T101500Z
Migrator rollback    : telegram-migrate:rollback-binance-web-foundation-20260908T101500Z
Feature gates        : checkout=false; auto-confirm=false
Cookie/session       : none stored during rollout
Final health         : database ready; app/db healthy; all restart counts 0
Final disk           : 71% used after old transfer-archive cleanup
Maintenance          : disabled after migration, worker, log, and admin audits
```

Production Compose was based on the existing server file and gained only the
30-second `/api/cron/payments/binance-web` and
`/api/cron/payments/binance-web/match` loops. Authenticated smoke returned zero
sessions, zero evidence, zero errors, and `autoConfirmEnabled=false`;
unauthenticated poll/match and Telegram webhook requests remained HTTP 401. The
session page, Binance ledger, and central Monitoring page rendered correctly
with `Belum ada data`. The configured recipient is intentionally omitted from
documentation.

Docker Desktop and the VPS use different image metadata stores, so the loaded
production image IDs differ from the local IDs. The archive checksum, every
root filesystem layer, creation timestamp, entrypoint/command, and SHA-256 of
the complete image configuration matched before production tags were moved.

The Binance method remains disabled until an operator uploads and validates a
fresh cookie through `/admin/payment-settings/binance-web`, reviews read-only
polling, and separately authorizes the checkout and auto-confirm gates. A cookie
previously exposed in chat should be rotated before controlled payment testing.

## Binance Cookie Export Compatibility Rollout (2026-09-09)

The Binance vault rejected a valid Chrome/Edge export because the previous
parser required every cookie value to be non-empty and limited values to the
strict RFC cookie-octet set. Binance's current browser export legitimately
contains an empty `currentAccount` value and a printable JSON `g_state` value.
The parser now accepts empty/JSON-like printable values while continuing to
reject control characters, semicolons/header injection, lookalike domains,
duplicate domain/path/name keys, and unsafe paths.

```text
Deployment ID       : binance-cookie-validator-20260909T143100Z
Tests               : 792 passed; 43 skipped across 139 passed files
TypeScript / ESLint : passed
Production app      : sha256:4e9394e664d1254e16a3349eaa9137d2286fe218462e0ea7fd5901ab69a74a64
Rollback tag        : telegram-app:rollback-binance-cookie-validator-20260909T143100Z
Backup              : /opt/telegram-store/backups/pre-binance-cookie-validator-20260909T143100Z.dump
Backup bytes        : 50,040,503
Backup SHA-256      : 413e06476681a2312add8e3c8ca92b5bd9e1aaca0677402d4943aaa8a0cbc422
Schema              : unchanged; existing migrator image retained
Gates               : checkout=false; auto-confirm=false
Health              : database ready; app/db/workers healthy; restart counts 0
Maintenance         : disabled after final audit
Cookie/session      : no new cookie stored; clipboard was empty
```

The previous failed session remains revoked and its old auth metrics are
historical telemetry only. No payment, order, wallet, stock, or customer row
was changed. Copy a fresh cookie JSON to the local clipboard (do not paste it
into chat), then submit it through the authenticated vault; only after
read-only validation succeeds may the session be activated.

## Shopee Payment Check Acceleration Rollout (2026-09-09)

Shopee payment detection was accelerated without changing matching or credit
semantics. Background polling now runs every 15 seconds and the local matching
worker every 5 seconds. Buyer-triggered refresh no longer scans a full 24-hour
history: it uses the selected invoice's creation/expiry window plus a two-minute
clock-skew allowance and at most three pages. Android fallback is explicitly
configured to 45 seconds, still bounded and fail-closed, giving several cookie
poll cycles priority before a signed Android event may confirm.

```text
Deployment ID        : shopee-fast-check-20260909T191700Z
Tests                : 792 passed; 43 skipped across 139 passed files
TypeScript / ESLint  : passed
Production app       : sha256:6878790d8b89a6d78c7264ae401de1e07d5e7cd1d3aae3de5d9268fc0bbab22b
Backup               : /opt/telegram-store/backups/pre-shopee-fast-check-20260909T191700Z.dump
Backup bytes         : 50,704,164
Backup SHA-256       : 0482c1896d4ff5684070a5151cf218c53aeaa770802d9fdb1d217e6ea31ec90b
Compose SHA-256      : db8da0fea6885a30bfa225fc055743cc2e8e0fbce7c2f564ee0e1d76f93fc80d
Fallback config      : SHOPEE_ANDROID_FALLBACK_DELAY_SECONDS=45
Health / restarts    : database ready; all services healthy; restart counts 0
Smoke                : poll errors=0; match ambiguous=0/errors=0
Maintenance          : disabled after final audit
```

The production Compose file was patched from the remote copy only at the two
Shopee loop intervals; no unrelated service definition was overwritten. Existing
invoice/order/wallet rows were not rewritten and no test payment was created.

## Shopee Wallet Top-up Refresh Rollout (2026-09-08)

Shopee-backed wallet top-ups now present their actual provider as `QRIS
ShopeePay` in Telegram and the admin dashboard instead of the legacy generic
`QRIS / DANA` label. A new `Refresh pembayaran Shopee` button is attached only
to newly created pending top-up invoices whose immutable QRIS snapshot is both
`SHOPEE_PARTNER` and `WEB_SESSION`.

The refresh action verifies the requesting chat owns the invoice, runs a
bounded poll for the snapshotted session, selects only the exact merchant
account/amount/window candidate, targets only that top-up attempt, and credits
the normal wallet transaction through `confirmWalletTopup()`. Multiple matching
transactions fail closed as ambiguous. Paid invoices are idempotent; expired,
legacy Android, foreign-provider, and unbound invoices cannot be revived or
credited by the button. Existing historical messages and expired rows were not
rewritten.

```text
Deployment ID        : shopee-topup-refresh-20260908T145744Z
Tests                : 790 passed; 43 skipped across 139 passed files
TypeScript / ESLint  : passed
Prisma validate      : passed
Next.js / Linux app  : passed
Schema               : unchanged; all 45 migrations current
Production app       : sha256:1c62267c7f0b21f6c32ccc13d4ce7fcb7f2309ced4db25671298b092653d0d3d
Production migrator  : sha256:cca0cdad1dd6a0d1102a77a707fafadf38a5f2a3bcd1400f7cb063d4962c23c1
Backup               : /opt/telegram-store/backups/pre-shopee-topup-refresh-20260908T145744Z.dump
Backup bytes         : 49,286,899
Backup SHA-256       : e63c0b05ed7a463bdf49853f1d8a30cde2554a59e4f8a5af3ea5b20ae42517b3
App rollback tag     : telegram-app:rollback-shopee-topup-refresh-20260908T145744Z
Migrator rollback    : telegram-migrate:rollback-shopee-topup-refresh-20260908T145744Z
Health / restarts    : database ready; app/db/workers healthy; all zero
Shopee smoke         : poll errors=0; match ambiguous=0/errors=0
Maintenance          : disabled after code, admin, worker, log, and count audits
```

Authenticated production QA showed `QRIS ShopeePay` on both successful and
expired Shopee top-ups. Product/stock/preorder/manual-review/delivery/top-up
problem counts and the total order count remained unchanged through the final
replacement. No test invoice, wallet credit, historical recovery, or customer
message was created during deployment.

## Load, Safety, Security, and Telegram UX Rollout (2026-09-12)

The candidate was audited for the existing production population of more than
1,200 users, then deployed under
`perf-telegram-ux-sec-20260912T051053Z`. The initial diagnostics were read-only;
the authorized rollout later changed only app/runtime configuration, rotated
two authentication secrets, and did not migrate or rewrite the database.

Read-only production sampling found the application responsive but already
resource-constrained on the current approximately 846 MB VM:

```text
Telegram webhook, 2,546 requests : p50 1.281 s; p95 2.303 s; max 20.564 s
/admin/products                  : p95 1.602 s; max 8.277 s
product stock page               : p95 3.818 s; max 17.484 s
product edit page                : p95 3.990 s; max 11.828 s
app / PostgreSQL sampled CPU     : up to approximately 67% / 33%
Caddy Docker JSON log            : approximately 714 MB and previously unrotated
```

The candidate reduces avoidable work without caching financial decisions:

- every admin `Link` disables automatic route prefetch, preventing one page
  from preloading several heavy ledgers/editors at once;
- shared admin inventory/sidebar counts use a one-second in-process cache and
  single-flight coalescing; the current single app replica is the intended
  boundary;
- product stock lifecycle totals use one low-cardinality `groupBy` plus the
  separately required banned-stock check instead of several count queries;
- Telegram membership checks cache positive results for 60 seconds, negative
  results for 5 seconds, coalesce simultaneous clicks, and force a fresh check
  only for the explicit verification action;
- Shopee matching ignores historical evidence that can no longer belong to an
  active payment window and coalesces overlapping worker runs;
- admin route-level `loading.tsx` boundaries provide composed sidebar/header,
  metric, table, and workspace skeletons;
- Caddy removes Telegram/relay/bridge authentication headers from access logs,
  and both Compose files rotate JSON logs at 25 MB with three files.

Telegram purchase completion is also consolidated. A document is sent with a
short, button-free caption. The existing navigation bubble first shows a short
payment/processing state, then changes after every delivery receipt is `SENT`
into one final message containing invoice, product, quantity, total, delivery
status, optional product guide, redeem action, order detail, missing-file
report, and catalog return. The redundant `Saya sudah menerima file` action is
removed. A final summary is queued even when a product has no custom guide, so
the processing state cannot remain stale after successful delivery.

Financial behavior is intentionally unchanged and is a required invariant:

- a verified wallet top-up credits wallet automatically and exactly once;
- a confirmed buyer who loses the last-stock race is refunded to wallet
  automatically and exactly once; the money is never discarded;
- mixed wallet contribution is restored on normal pending-invoice
  expiry/cancellation;
- delivery errors do not create broad automatic credits. Only Telegram's
  explicit private-recipient-unreachable allowlist may use the existing
  delivery refund path; accepted, sending, sent, unknown, entity, file-size,
  crypto, database, network, and Telegram 5xx outcomes remain non-refundable
  and require safe retry/review.

Final candidate validation:

```text
Unit/repository suite      : 142 files passed, 18 skipped; 807 tests passed, 43 skipped
PostgreSQL 17 integration  : all 45 migrations; 43 opt-in DB tests passed
High-risk financial subset : 15/15 passed (100-operation idempotency, contention,
                             wallet top-up/debit/refund, final-stock race)
TypeScript / ESLint        : passed
Prisma validate            : passed
Next production build      : passed on Next.js 16.3.3 and sharp 0.35.4
Built-app admin smoke      : authenticated login plus 40 non-dynamic routes; 0 failures
Schema candidate           : unchanged; no new migration
Production deployment      : completed with maintenance, backup, rollback, and audits
```

One integration cleanup defect was found and fixed in
`tests/payment-method-availability-db.test.ts`: the disposable test now deletes
its `QrisInvoiceAttempt` rows before deleting parent orders. This affects test
cleanup only.

The dependency audit found a critical Next.js/Image Optimization advisory in
16.2.12 and a high-severity image-processing advisory in sharp 0.35.0. The
rollout was paused before production maintenance, upgraded to Next.js 16.3.3
and sharp 0.35.4, reran the full validation suite, and rebuilt both Linux
targets. The critical runtime advisory count is now zero. Remaining high audit
entries belong to Prisma CLI/MySQL tooling; the app uses PostgreSQL and the
standalone runtime does not contain the Prisma migration CLI.

Production rollout evidence:

```text
Deployment ID          : perf-telegram-ux-sec-20260912T051053Z
Production app         : sha256:cfa1465aab6d47ec9045ecda7d2d044fbf75779d6921930b9c371190685406ad
Local archive layers   : verified identical to local sha256:bdd965ed84b2f9f626fe7ec57440fe4f80490445e6c7d5c9b63a53992ee68e24
Production migrator    : sha256:cca0cdad1dd6a0d1102a77a707fafadf38a5f2a3bcd1400f7cb063d4962c23c1 (unchanged)
App rollback tag       : telegram-app:rollback-perf-telegram-ux-sec-20260912T051053Z
App rollback image     : sha256:6878790d8b89a6d78c7264ae401de1e07d5e7cd1d3aae3de5d9268fc0bbab22b
Backup                 : /opt/telegram-store/backups/pre-perf-telegram-ux-sec-20260912T051053Z.dump
Backup bytes           : 52,247,921
Backup SHA-256         : 01ec256c9f604df85e0a85960a417d3d1a565a6670bb08e45839e1684bdc35b8
Compose SHA-256        : 910753a889d42ca9bef22f2be721955461d8000628ca46e10804d1641ef3a0e0
Caddyfile SHA-256      : 34fd5873aea537823797a95f1ab9160c63060595f9dacbc97dde3bd1b1f5486e
Schema                 : unchanged; all 45 migrations already current
Maintenance            : enabled before workers/backup; disabled after final audit
Runtime                : all five containers running; restart 0; OOM false
Webhook                : new secret active; old secret rejected; pending 0; no error
Cron                    : new secret accepted; old secret rejected
Provider smoke         : Shopee/Binance poll and match errors=0; ambiguity=0
Delivery/outbox        : pending=0; unknown=0; new failures=0
```

The production Compose rollout was derived from the live server file and added
only JSON log rotation. It intentionally did not copy the unrelated local
re-engagement loop into production. Caddy was recreated before the webhook
rotation, removing the old approximately 714 MB container log and ensuring the
new secret could not be recorded. That old Docker log is not recoverable; the
verified database/config backups and rollback images remain.

PostgreSQL was intentionally not recreated merely to adopt a logging option.
Its volume and container stayed untouched; the current DB JSON log was only
about 0.75 MB. The configured rotation will apply at the next separately safe
database-container recreation.

The three monitoring alerts after rollout were audited as historical: buyer
missing-file reports existed before deployment, exhausted broadcast sends were
for recipients that blocked the bot, and the only failed receipt was the known
7 September `ENTITY_TEXT_INVALID` incident with no Telegram message ID and its
stock already `AVAILABLE`. No issue was created during the rollout. Checkout
was reopened only after this reconciliation, worker cycles, authenticated admin
smoke, public health, webhook, secret, resource, and log checks passed.

Residual limits are explicit: notification polling still performs several
database operations every second while idle; route skeletons are segment-level
Suspense rather than independently streamed live data components; Shopee does
not yet have a Binance-style aggregate error-rate table; the short admin cache
is not shared across future replicas; and the current VM should be raised to at
least 2 GB if active concurrency continues to grow.

## Shopee Worker Recovery, Stock Copy, and Stable Sidebar Hotfix (2026-09-12)

Immediately after the rollout, the owner showed an authenticated admin page
where the previously valid Shopee session had changed to `ERROR` with
`WORKER_ERROR`, and a real QRIS callback was rejected because the session was no
longer active. Checkout maintenance was re-enabled and both workers were
stopped before diagnosis.

The incident had two related worker-state defects:

- a generic internal exception set an otherwise authenticated `ACTIVE` session
  permanently to `ERROR`; only explicit authentication failure or account
  mismatch should disable it;
- the first recovery patch allowed `ERROR/WORKER_ERROR` through polling and read
  all three Shopee pages, but the final transactional commit still accepted
  only `ACTIVE` or `PENDING_VALIDATION`, producing a safe `LeaseLostError`. That
  lease loss was also incorrectly counted as a worker error.

The final policy is now explicit:

- `AUTH_REQUIRED` still moves the session to `EXPIRED`;
- `ACCOUNT_MISMATCH` still moves it to `ERROR`;
- a generic `WORKER_ERROR` records a sanitized error but does not demote a valid
  session;
- a session already left in `ERROR/WORKER_ERROR` becomes retryable after a
  30-second delay, can decrypt its existing vault credentials only while holding
  the matching polling lease, and can atomically return to `ACTIVE` after a
  successful poll;
- losing a commit lease is an idempotent concurrency outcome and no longer
  increments the error metric.

The existing encrypted Shopee session recovered without re-uploading the cookie
or metadata token. A controlled production poll read three pages with
`unauthorized=0`, `accountMismatch=0`, `errors=0`, cleared `lastErrorCode`, and
restored `ACTIVE`. Later scheduler cycles kept it active. Credentials pasted in
chat were not copied into source, documentation, deployment files, or logs.

Telegram broadcast quantity copy was corrected consistently: Indonesian
product-created/restock/sold-out messages now say `stok` rather than treating
each inventory unit as a `file`; English copy uses `unit` or `stock unit`.

Admin loading now renders the shared real `AdminSidebar` instead of a shimmering
sidebar replica. Brand, links, click targets, and route active state remain
normal while only the right-side header, metrics, table, or workspace uses a
skeleton. The sidebar definition is shared with the completed `AdminShell`, so
the loading and loaded navigation cannot drift independently.

```text
Final production app : sha256:47d4fe5635b9612a82c1acaff4d0d7ba8f58299ba2eb54093c595ec8eeba3900
Safe rollback tag    : telegram-app:rollback-admin-sidebar-stable-20260912T070220Z
Safe rollback image  : sha256:ba9c84648e5cd83595cdaf84b4634262a4a20591c4ed2aa19c0129aa344fe624
Pre-incident rollback: sha256:cfa1465aab6d47ec9045ecda7d2d044fbf75779d6921930b9c371190685406ad
Backup               : /opt/telegram-store/backups/pre-shopee-worker-recovery-stock-copy-20260912T062609Z.dump
Backup bytes         : 52,297,434
Backup SHA-256       : 3c5e1ae46f6f2b3959edaa09f0b283888fd238daff52ee0d55b807f3ff8611e6
Tests                : 142 files passed; 811 assertions passed; 43 skipped
TypeScript / ESLint  : passed
Prisma / Next build  : passed
Schema               : unchanged; no migration
Runtime              : all containers running; restart 0; OOM false
Shopee               : ACTIVE; three-page poll; errors/ambiguity 0
Maintenance          : disabled after worker and admin audits
```

The incomplete first recovery image was deliberately removed and is not a
rollback target. Temporary transfer archives were deleted after checksum/image
verification; verified backups and the safe rollback image remain.

Mandatory change gate for payment/provider work: before editing or deploying a
provider, enumerate every transient and terminal state transition, prove that a
generic infrastructure error cannot disable checkout or credit/refund money,
test encrypted-session survival across container recreation, test automatic
recovery from retryable state, run exact account/amount/window/ambiguity tests,
run real PostgreSQL concurrency tests, then use maintenance, verified backup,
rollback image, controlled provider poll/match, checkout-readiness, worker, and
public-health audits. A provider change is not complete merely because it builds
or its happy-path poll succeeds.

## Optional Community and Telegram Menu UX Rollout (2026-09-12)

Channel membership is no longer an access gate. The bot does not call
`getChatMember`, does not verify membership before callbacks, and does not block
catalog, payment, wallet, orders, delivery, referral, SMS, or redeem when a user
has not joined a channel. `TELEGRAM_REQUIRE_CHANNEL_MEMBERSHIP` is set to false
in production and no longer controls application behavior.

This does not relax the privacy boundary. `handleTelegramUpdate()` still exits
before all commerce/session handling unless the originating chat type is
`private`. Messages and callbacks from groups, supergroups, and channels remain
ignored, so order, wallet, stock, payment, and credential data cannot be opened
through a group chat. A source regression test enforces the ordering of that
guard before `handleMessage()`.

The community page now explains why the links exist instead of showing a
generic membership disclaimer: they carry stock updates, promos, and service
news; shopping, payment, and delivery remain in the private bot chat. Old
`verify_membership` buttons remain backward compatible and now return the main
menu with the same optional-community explanation.

The final main menu uses the provided BWR Tele artwork as one menu-only photo,
a short separator in the caption, and four compact rows. Long Codex text is a
full-width button instead of being truncated on mobile:

```text
Produk digital        | SMS & OTP
Wallet & top up       | Order saya
Ambil login Codex Free
Referral              | Lainnya
```

`Lainnya` contains Notifikasi/Bahasa, Komunitas & update, Bantuan, and a back
action. `/help` shows a short purchase/payment/delivery guide and direct Product,
Order, and admin-support actions instead of simply reopening the main menu.
Community links moved off the main screen. Custom emoji remain limited to
product/category presentation; menu and command labels use readable plain text.

The visible BotFather command list is intentionally limited to eight commands:
`/start`, `/catalog`, `/sms`, `/orders`, `/wallet`, `/redeem`, `/referral`, and
`/help`. Legacy aliases such as `/balance`, `/topup`, `/subscribe`,
`/unsubscribe`, `/language`, and `/myid` remain accepted by the backend but do
not crowd the command picker.

The GitHub `shop-bot` topic was reviewed only for UX references. Useful common
patterns were a short `/start`, immediate catalog access, prominent order and
support actions, and a small command surface. Third-party payment, balance, and
fulfillment implementations were not copied because several are templates or
explicitly non-production examples and do not satisfy this project's financial
invariants.

```text
Deployment ID        : telegram-menu-optional-community-v2-20260912T092224Z
Production app       : sha256:3b1456a45b6d941458d3022091b744d6a2f9a3ecbe429ec4e7fbf4d75198ff1a
Rollback tag         : telegram-app:rollback-telegram-menu-optional-community-v2-20260912T092224Z
Rollback image       : sha256:cc968cb061a0db9904892c38f2121aa06020b44a4884506d927fec24706b4064
Backup               : /opt/telegram-store/backups/pre-telegram-menu-optional-community-20260912T092224Z.dump
Backup bytes         : 52,456,572
Backup SHA-256       : 9acb6cb14f05979427218c9d746ae7d35812e721a050ef37ab97183e81352149
Tests                : 143 files passed; 808 assertions passed; 43 skipped
TypeScript / ESLint  : passed
Prisma / Next build  : passed
Schema               : unchanged; no migration
Webhook              : pending 0; no last error; pending updates preserved
Shopee               : ACTIVE; three-page poll; errors 0
Maintenance          : disabled after worker/private-boundary/health audits
```

The menu image is available from `/bwr-tele-menu.png` and returned HTTP 200 as
`image/png` in production. The temporary transfer archives and redundant
candidate tags were deleted after verification. The database/config backup and
rollback images remain.

## Stock Warehouse Download and Paste Intake (2026-09-13)

The stock admin now exposes one compact `Kelola` menu per row. Detail and
direct download are always available, while edit, health check, archive,
restore, and permanent delete remain gated by the existing lifecycle policy.
Reserved and delivered stock still cannot be permanently deleted; all server
guards in `canPermanentlyDeleteStock()` remain authoritative.

Bulk operations are split clearly:

- `Download terpilih` exports up to 100 checked rows without changing stock,
  order, reservation, delivery, or wallet state.
- A product warehouse has `Download semua stok`, including available,
  reserved, delivered, banned, disabled, and archived rows for that product.
- Product export is capped at 5,000 rows and 24 MiB decrypted aggregate data.
  Rows are loaded in bounded 100-row pages. Oversized exports fail closed and
  instruct the operator to download smaller selected batches.
- ZIP filenames are sanitized and deduplicated. Decrypted source buffers and
  the server-side archive buffer are zeroed after response construction.
- Every download is admin-authenticated, same-origin protected for POST, and
  returned with private no-store headers.

`StockUploadForm` now gives paste intake first-class space. The large textarea
uses one non-empty line as one stock item, ignores blank lines, displays the
unique-line estimate, and keeps the draft after network/server failure. File
upload remains available in the same operation. The server normalizes line
endings, caps paste input at 5,000 lines and 1 MiB, creates one temporary TXT
input, and sends it through the existing expansion, deduplication, encryption,
health-check, preorder-allocation, and restock-notification pipeline. No second
credential parser or encryption path was introduced.

```text
Deployment ID          : stock-warehouse-ux-20260913T053722Z
Production app         : sha256:f76f9ed4d5ce14b4ab2b61ecf0f08393ae2f7d64d3d32efff9c5a5643876f12c
Rollback tag           : telegram-app:rollback-stock-warehouse-ux-20260913T053722Z
Rollback image         : sha256:3b1456a45b6d941458d3022091b744d6a2f9a3ecbe429ec4e7fbf4d75198ff1a
Backup                 : /opt/telegram-store/backups/pre-stock-warehouse-ux-20260913T053722Z.dump
Backup bytes           : 52,855,565
Backup SHA-256         : 0f7a625bb67ed2abfa8a6044a4d1caa31db07ca9018a84dfcb223b310feb6f7b
Transfer archive       : 300,397,056 bytes; SHA-256 matched; removed after load
Tests                  : 146 files passed; 820 assertions passed; 43 skipped
TypeScript / ESLint    : passed
Prisma / Next build    : passed
Disposable PostgreSQL : all 45 migrations and candidate health passed
Schema                 : unchanged; production migrate reported no pending migration
Shopee                 : ACTIVE; three-page poll; errors 0
Webhook                : pending 0; retained restart-time 500 timestamp only
Maintenance            : disabled after worker, historical-alert, health, and UI audits
```

Compose unexpectedly recreated the PostgreSQL container while starting worker
dependencies. The named volume remained exactly
`telegram-store_telegram_store_postgres`, the database returned ready, all 45
migrations were already current, and every service restart count remained zero.
No volume reset/removal, schema change, or direct customer-data rewrite occurred.

Monitoring remains critical only because historical records are intentionally
retained: 30 failed `DIGITAL_FILE` notifications are entity-format failures
dated 25 August through 7 September, and 98 manual-review rows predate this
rollout. The latest buyer missing-file report was at 11:24 Jakarta time, before
maintenance/deployment began. Post-rollout reconciliation returned processed,
sent, retry, failed, and manual-review all zero; outbox pending, delivery
failed/unknown, expiry backlog, and new rejected states remained zero.

## Telegram Account Summary and Stock Text Fix (2026-09-14)

The main menu now shows a compact private account summary instead of copying a
third-party store dashboard. It contains only data useful to the current user:
Telegram ID, username, completed-order count, completed-order spend, wallet
balance, and stock-alert status. It deliberately omits fake reseller/member
labels and global store revenue/user statistics. The summary uses three bounded,
indexed queries in parallel and is protected by both the webhook private-chat
guard and the notification-worker positive private-chat-ID guard.

The textarea-only stock failure was traced to the browser's multipart behavior.
An unselected file input still contributes a placeholder `File` with an empty
name and zero bytes. The route previously imported that placeholder before the
synthetic `pasted-stock.txt`, producing `422 stock-empty` even though pasted
text was valid. The route now ignores only the exact browser placeholder
(`name=""` and `size=0`). A real selected empty file still fails validation.

Production used a non-mutating regression smoke: an authenticated request sent
the empty browser placeholder plus one intentionally oversized 65 KiB text
line. The deployed route returned `422 stock-too-large`, proving the placeholder
was removed and the text reached the normal stock pipeline. No inventory row
was created.

Product broadcasts no longer show two icons on the first button. When Telegram
receives an `icon_custom_emoji_id`, the leading Unicode fallback emoji is
removed from that button label. If no valid custom emoji exists, the Unicode
emoji remains, preserving a visible fallback.

```text
Deployment ID          : telegram-account-stockfix-20260914T112832Z
Production app         : sha256:f24adfff3ba30fb62d0803f654ad4e5d72557fd773c00464df41d0b4fbaf56a1
Rollback tag           : telegram-app:rollback-telegram-account-stockfix-20260914T112832Z
Rollback image         : sha256:f76f9ed4d5ce14b4ab2b61ecf0f08393ae2f7d64d3d32efff9c5a5643876f12c
Backup                 : /opt/telegram-store/backups/pre-telegram-account-stockfix-20260914T112832Z.dump
Backup bytes           : 53,560,527
Backup SHA-256         : 50916c15f0f7db22ad43ac7c8ff51a3bfbce4d216e347d5a98bce3d97931f5ab
Transfer archive       : 300,398,080 bytes; SHA-256 c1fe150e5ca509fe072844f6114515d03d9c5135827cdbca69b3743cb932848e
Tests                  : 147 files passed; 825 assertions passed; 43 skipped
TypeScript / ESLint    : passed
Prisma / Next build    : passed
Disposable PostgreSQL : all 45 migrations and candidate health passed
Schema                 : unchanged; production migrate reported no pending migration
Shopee                 : ACTIVE; worker transport errors 0
Webhook                : pending 0; restart-time 500 timestamp retained
Maintenance            : disabled after stock, worker, provider, health, and UI audits
```

Only the app container was recreated. Starting the existing worker containers
also ran the already-created migrator dependency, which reported no pending
migrations; the PostgreSQL container and named volume were not recreated.
Public health returned database ready, all long-running containers had restart
count zero, worker reconciliation returned all zero, and recent app/worker
fatal or transport-error counts were zero. Telegram retained a webhook HTTP 500
timestamp from the controlled app replacement at 18:30:26 Jakarta time, but
pending updates returned to zero and the timestamp did not advance.

## Separate Web Storefront Scaffold (2026-09-14)

The new website lives in the isolated storefront/ folder. It has its own
Next.js package, lockfile, Dockerfile, Compose file, Caddy config, health route,
landing page, catalog placeholder, and future server-to-server API client.

The current Telegram VPS remains:

    Host       : 70.153.137.10
    Public URL : https://70-153-137-10.sslip.io
    App path   : /opt/telegram-store
    Compose    : /opt/telegram-store/docker-compose.yml

The storefront VPS is intentionally TBD. It must receive a different host,
domain, Docker project, Caddy volumes, environment file, and (if needed later)
database volume. The storefront does not share PostgreSQL, Prisma, encryption
keys, payment credentials, bot tokens, or DANA/Shopee/Binance sessions.
It must never be deployed on 70.153.137.10; that host remains dedicated to the
Telegram backend, database, payment verification, stock, and workers.

The planned connection is browser -> storefront server -> signed HTTPS API ->
Telegram backend. The browser never receives the shared secret and the
storefront never confirms payment, reserves stock, changes wallet balance, or
delivers credentials. The initial client boundary signs timestamp, request ID,
HTTP method, path, and body hash with:

    TELEGRAM_STORE_API_BASE_URL
    TELEGRAM_STORE_API_KEY_ID
    TELEGRAM_STORE_API_SHARED_SECRET

The API is intentionally disabled until the endpoint contract, Telegram Login
verification, idempotency, replay window, and allowlist are reviewed. Details
are recorded in TELEGRAM_STOREFRONT_BLUEPRINT.md.
Public catalog reads will be cached for 30-60 seconds on the storefront VPS so
ordinary website page views do not become repeated Prisma queries on the
already-constrained Telegram VPS. Checkout and payment status remain fresh and
fail closed.

## Web Storefront Commerce Update (2026-09-15)

The storefront remains a separate deployable Next.js app with no Prisma client
or direct database connection. It now uses the same Telegram backend API and
the same production PostgreSQL business data rather than a second commerce
database. The only split is the order/delivery channel:

- `Order.channel=TELEGRAM` keeps the existing Telegram outbox and delivery
  worker behavior.
- `Order.channel=WEB` uses the same checkout, payment matching, stock locks,
  wallet refund, expiry, and preorder logic, but creates a unique Web delivery
  receipt instead of a Telegram file notification.
- `SentDelivery.stockItemId` remains globally unique across both channels, so
  one credential cannot be sent through Telegram and downloaded on the Web.

Web buyers provide an email and a password during checkout. The backend stores
only a keyed contact lookup hash, masked contact, bcrypt password hash, and a
hash of each opaque session token. Order search accepts email or invoice plus
that password. The storefront stores the opaque token only in an HttpOnly,
SameSite cookie; the browser never receives the service API secret.

Implemented signed API foundations include catalog, checkout, access/revoke,
order list/detail/cancel, QRIS image, payment reference/refresh, authenticated
Web stock downloads, and paid-only product attachment downloads. Paid Web
orders expose the current product guidance and encrypted product attachment on
the password-protected invoice page. Refunded, cancelled, expired, unpaid, and
cross-customer requests fail closed and cannot read those resources. The paid
invoice UI also hides the QR/payment instructions after confirmation so a
customer is not prompted to pay the same invoice twice.

The local E2E flow has verified checkout -> QRIS -> paid -> Web receipt READY
-> attachment download -> stock download, with zero Telegram notifications.
The database integration suite also covers repeat download idempotency,
Web-versus-Telegram last-stock contention with wallet refund, password lockout,
pending invoice cancellation, paid-only guidance/attachment access, and the
refunded-order denial path.

For local testing, a fresh disposable database was migrated and populated with
only 5 `ProductGroup` rows and 49 `Product` rows copied from production (44
active). No production users, orders, payments, wallets, provider sessions, or
encrypted stock were copied. Synthetic local stock and a local QRIS merchant
are used for tests. Production PostgreSQL and the production app image remain
unchanged; the Web migration/API have not been rolled out there.

Each active product in the disposable clone intentionally received one
synthetic stock row. Therefore the local storefront currently shows
`Tersisa 1` for those products; this is test data, not a production stock
snapshot. A deployed storefront will read the live aggregate count from the
signed production catalog API.

Products without `imageUrl` use the shared
`storefront/public/placeholders/product-fallback.webp` asset. It is an exact
1600x900 WebP (16:9, about 59 KB) derived from the owner-supplied illustration.
Product card, detail, cart, and checkout artwork all preserve 16:9. The home
popular-products section uses a reusable horizontal carousel with fixed-width
cards, scroll snap, visible previous/next controls, desktop trackpad scrolling,
mouse drag, and native mobile swipe instead of compressing five cards into one
row. Its scrollbar is hidden and the navigation controls are overlaid at the
vertical center of the card rail.

The home trust/benefit block is implemented as reusable
`storefront/src/components/site/why-choose-section.tsx`. It uses the
owner-supplied transparent illustration, cropped to the character only and
stored as `storefront/public/why/why-character.webp` (600x700, about 55 KB).
Desktop renders the copy, three benefit cards, safety badge, and character in
one wide panel. Tablet removes the decorative character and preserves three
cards. Mobile switches to compact linked rows with icons, descriptions, and
chevrons. Live viewport checks passed at 1440, 1024, and 390 CSS pixels.

The owner-supplied category illustration was cropped into its reusable visual
parts and recomposed as the transparent 1800x400 banner
`storefront/public/headings/category-heading-banner.webp` (about 56 KB). This
keeps the app cards and character readable inside the shared short heading.
`/categories` and category-detail fallbacks use the reusable `PageHeading`
natural image treatment. Do not introduce a taller category-only heading:
browser measurement confirms `/shop` and `/categories` are both exactly 185 CSS
pixels high on desktop. Only artwork treatment differs.

Storefront UI symbols use the dependency-free reusable
`storefront/src/components/ui/icon.tsx` SVG component. Do not add an icon
package merely for these controls. A local attempt to add `lucide-react`
resolved the caret React dependency from 19.2.8 to 19.3.0 while the old dev
server was still running, causing an invalid-hook / `useInsertionEffect`
runtime failure. The package was removed, React and React DOM are now pinned to
exactly 19.2.8, `.next` was rebuilt from scratch, and browser runtime validation
returned no console/runtime errors. No backend, database, bot, or VPS setting
was involved in that frontend-only incident.

Clerk authentication is now scaffolded only in `storefront/` and linked to
application `app_3JLkORzgGrGJAitRHvP3wrCFqhu`. The integration uses
`@clerk/nextjs`, `@clerk/localizations` with Indonesian localization,
`ClerkProvider` inside `<body>`, `src/proxy.ts`, dedicated `/sign-in` and
`/sign-up` routes, and signed-out/signed-in controls in the existing header.
The proxy matcher contains `/(api|trpc)(.*)` followed by exactly one
`/__clerk/:path*`. Development keys remain only in ignored `.env.local`; source
and documentation contain placeholders only. `clerk doctor` passes all Clerk
checks. The Clerk production instance is not configured yet.

The `/sign-in` and `/sign-up` surfaces now share a reusable full-width,
responsive split-screen shell. The supplied character scene is stored as the
optimized `storefront/public/auth/auth-character-scene.webp` asset and rendered
as the full left-side background rather than as a visibly nested image card.
The Clerk surface presents email and phone-number entry; social-provider
buttons and their divider are hidden on these storefront pages. Desktop,
tablet, and mobile use breakpoint-specific composition without changing the
Clerk/backend authorization boundary. The update was validated with TypeScript,
ESLint, and live HTTP rendering only; no Docker build was run for this UI pass.

Clerk commerce identity, account pages, and refund-wallet usage are now implemented
as a disabled local candidate; see `STOREFRONT_ACCOUNT_WALLET_ROLLOUT.md`. No database
operation or deployment has applied this candidate. The existing password session
remains the active behavior until both feature flags and the reviewed additive
schema are rolled out. Never grant wallet/order access merely because a Clerk
email string matches an order email.

Latest local validation after the protected-resource work:

```text
Root tests                  : 151 passed files, 838 passed tests
Root TypeScript / ESLint    : passed
Root production build       : passed
Web DB integration          : 5 passed
Storefront TS / ESLint      : passed
Storefront production build : passed
Desktop/mobile visual QA    : passed against a live authenticated local order
Local API image             : sha256:2c5abc0283717931a1a68f98f0e02b8ad4c30152bfa417c4e263d21790300b22
Clerk doctor / Docker build : passed; image sha256:468bf14a88f0935d518bfec06c023017031b11665e1b8d776ee9caac7ea548cc
```

## Validation Commands

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npx.cmd --no-install prisma validate
npm.cmd run build
```

Database integration suites are opt-in and must use an isolated test database.
Do not point destructive/integration test flags at production or real local data.

## Fast Operational Checks

```powershell
curl.exe -fsS https://70-153-137-10.sslip.io/api/health
ssh -i "$env:USERPROFILE\.ssh\telegram-store-azure" azureuser@70.153.137.10 "cd /opt/telegram-store && sudo docker compose ps"
```

When a user says `apply`, `update`, or `deploy`, they mean the Azure production
stack, not only the local build.

## Storefront cart UI and actual Telegram feature boundary (2026-09-15)

The current independent Telegram implementation has no voucher/coupon flow or
voucher pricing model. Voucher references in the original bridge blueprint are
historical reference behavior, not implemented store features. Do not add a
voucher field, discount, or a voucher-unavailable placeholder to the storefront.

The cart now uses the shared PageHeading with the existing owner-supplied cart
artwork, one product-list panel, selection checkboxes, quantity/delete controls,
a selection subtotal, and cached-catalog recommendations. A native confirmation
dialog protects clearing the cart. Checkout remains per product: a single
selection links to that product's existing checkout; multiple selections open
an invoice-product chooser. The browser does not create orders in a loop or
invent combined checkout/payment behavior. Fees remain calculated by the backend
when the invoice is created; the cart labels its amount as an estimate.

The root horizontal overflow uses clip instead of hidden, preserving the
viewport as the sticky-header scroll container. Browser checks confirmed the
cart target remains visible after scrolling Home and that flight/pulse elements
appear and clean up. The mobile navigation drawer is fixed beneath the header.
Telegram links strip accidental surrounding quotes and validate the public bot
username. Storefront delivery copy points to private Web orders/downloads.

This is a local storefront UI update. No production configuration, database,
payment worker, checkout transaction, or Telegram runtime was changed. Docker
and production builds remain deferred by owner instruction.

Validation checkpoint: full default suite 878 passed / 50 skipped; final focused
Clerk/wallet suite 41 passed. Backend and storefront TypeScript/ESLint passed;
Prisma schema validation passed. Chrome checked desktop /account and mobile
/account/wallet only in disabled mode, with no console errors. Live account
linking, real PostgreSQL concurrency, authenticated wallet E2E, and production
build/deployment remain unperformed. No database was accessed or changed.


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

## Historical browser cart login boundary (2026-09-15; superseded below)

There is no Web Cart/CartItem database model or cart persistence API. The Prisma
BotSession.cart JSON belongs to Telegram conversation state. The storefront cart
remains browser-local; it now uses a separate v2 storage key per Clerk user.
Signed-out visitors cannot add/change/remove cart items. CartProvider remounts
its state on Clerk account changes and never assigns the old shared anonymous
v1 cart to an account automatically. Old anonymous storage is not deleted.

The shared AddToCartButton shows login links for signed-out visitors and disables
interaction while authentication/cart hydration is loading. Product detail uses
a login-to-checkout link for guests and disables purchase for sold-out products.
Storage parsing rejects malformed/duplicate records and invalid quantities.
No database migration, production deployment, or user-data operation is involved.


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

Final database-cart checkpoint: the default suite passed 898 tests with 59
opt-in tests skipped. The nine cart DB cases were run separately and passed.
The task-labelled disposable PostgreSQL container was removed after verification;
no existing local or production database/container was removed or modified.

## Auth form clipping correction (2026-09-15)

The auth shell's old 620px + 420px minimum columns overflowed between the 980px
stacking breakpoint and 1040px combined minimum. Both tracks now allow shrinking,
and auth-only stacking begins at 1100px without changing navbar breakpoints.
Shared Clerk appearance gives root/card wrappers min-width zero, bounded widths,
no negative card margin, visible card-box overflow, and 4px focus-ring breathing
space. Root form width remains capped at 430px. Chrome checks at 1024px, 1280px
and 320px found the panel/inputs within the viewport, including a focused input.
This is a storefront-only UI edit; no API, database or production change.

## Focused mobile authentication layout (2026-09-15)

At storefront widths up to 860px, the sign-in/sign-up shell now prioritizes the
Clerk form. The marketing illustration, promotional heading/benefits, standard
site navbar, drawer and bottom navigation are hidden on these auth routes only.
A compact logo/shop-return bar replaces them. The form starts directly below
that bar, with reduced heading spacing and 16px input text for mobile. Required
Clerk inputs, verification, errors, sign-in/sign-up switching and provider footer
remain functional. Desktop keeps the existing split-screen composition.

## Production Clerk commerce and cart active (2026-09-15)

The owner explicitly approved DNS Clerk, verified backup, the additive cart
migration and activation. Current storefront: https://store.buildwithreys.com,
on the separate Freestyle VM vm-a6fa78d4cf43495dabed6f7545c972da.
Clerk production DNS/SSL/mail are complete; email/password login is active,
phone/SMS is disabled. Both Clerk commerce flags are true; frontend preview
read-only is false. Global checkout maintenance is off and workers are running.

Only migration 20260915173000_add_web_cart was newly applied; all 48 migrations
match the validated manifest. PostgreSQL container and volume were preserved.
No existing customer/order/wallet/stock rows were manually edited or reseeded.
Backup: /opt/telegram-store/backups/clerk-cart-20260915T155646Z/database.dump,
54,655,422 bytes, pg_restore --list valid, SHA256
6143ab3d223b9cd0bd885121728de9a3d6256efb57715cc6c58d682bf128ff6d.

Backend image: sha256:a2497c552e9869164564b658065d04dcce9a0649daaeb623fc5edf34890f1311.
Migrator: sha256:42efc93a031dbf28eee72696b8e8199b8dab58a41e6a5b9b17144e72e5ab42bf.
Frontend: sha256:02efeb6a327d0df05ca19db30581c3e479639c3ed349a0cb5c5f00712b5661cc.
Rollback tags and private config backups are listed in
storefront/COMMERCE_ACTIVATION_RESULT.md. Keep Clerk bindings intact in recovery;
never silently restore legacy access for already bound users.

Validation: 898 default tests passed/59 skipped, 47 identity/cart tests passed,
12 disposable DB transaction tests passed, both builds/typecheck/lint passed.
Live health and signed catalog 200; unsigned/invalid identity 401; replay 409.
Frontend anonymous account/cart/checkout POSTs now return 401 sign_in_required,
not preview_read_only. Preview banner is gone; Chrome loaded production login.
Worker reconciliation and Telegram webhook pending count were all zero.
No real payment or production customer binding was performed by the agent.
Owner must register/sign in to production, verify email and connect Web account
once before their purchase test. Development accounts do not migrate implicitly.
Web delivery stays in protected orders, Web/Telegram wallets stay separate,
and Web top-up/automatic email product delivery remain unimplemented.


## 2026-09-16 recovery and reusable deployment

- Original Freestyle VM cannot boot due to unsettled disk head; it was preserved.
- Replacement frontend VM: `vm-1e4af20a1b0d43b0adaebafb41196004` (`store-recovery-20260916`).
- Runtime directory `/home/ubuntu/storefront`, container `storefront-template`.
- Live frontend release `20260915-194429`; custom domain TLS rule now targets replacement port 3000.
- Backend image `telegram-app:web-fix-20260916`, deployed to existing Azure stack. No migrations; database container and environment unchanged.
- Global maintenance released after health, invoice audit, worker reconciliation (0 failures/retries/manualReview), and webhook pending=0.
- Late Rp567 payment credit remains owner-operated; this deployment did not credit wallets.
- Reusable frontend commands: `deploy/template/deploy.py`; setup and domain docs in `deploy/template/`. Builds happen on VM.
- Email-only registration verified in Chrome at 320px; QRIS prioritized and mobile pending QRIS panel placed before summary.
- API-key rotation deferred until owner sends intended key/access.


## 2026-09-16 cart preview and frontend optimization

Frontend release `20260916-032912` adds hover/tap cart preview using existing database-backed cart context, shared-template order heading/account summary and mobile order cards, responsive local-image optimization, and bounded catalog prefetch. See `storefront/CART_PREVIEW_OPTIMIZATION.md` for checks and measured payloads. No backend or schema change in this release.


## 2026-09-16 static shop cards and supplied order artwork

Frontend release `20260916-035022`: removed product-card entrance animation and hover transform/transition. Orders heading, empty state, and signed-out orders gate use the owner-supplied `/headings/orders-heading.png` (1536x1024 transparent PNG). Build/typecheck/lint/frontend tests and public asset checksum/health verified. No backend or database changes.


## 2026-09-16 contained orders heading and cart controls

Frontend release `20260916-035857`: fixed split/contain illustration CSS and gave orders heading a 260px desktop canvas; homepage motion disabled (entrance, transitions, smooth carousel, add-to-cart flight). Cart preview now uses existing setQuantity/remove actions with pending/retry locks and quantity limits. OUT_OF_STOCK product artwork renders grayscale; PREORDER and available products stay colored. Seven isolated UI tests, frontend typecheck/lint/build, production health and computed-style checks passed. Orders heading visual inspection uses the real shared component in a local fixture with synthetic order data. No backend or schema changes.


## 2026-09-16 pending dev review (NOT deployed)

Owner now requires dev review before any further deployment. Current local changes fix global add-button loading and preview closing on quantity update, add order filters/search/copy and Telegram support links, differentiate purchase buttons, and redesign Account with supplied assets. Isolated interactive UI preview runs at http://127.0.0.1:4175 using actual components plus in-memory sample data. See `storefront/DEV_REVIEW_2026-09-16.md`. Production remains release `20260916-035857`; do not automatically deploy the dev changes.


## 2026-09-16 approved dev rollout completed

Owner approved deployment after dev review. Frontend release `20260916-044753` is live and healthy on Freestyle. Includes local add-button loading, persistent cart preview during mutations, orders filters/search/copy, differentiated product CTAs, @davidboysaja support links, and composed Account assets/dashboard. VM build/typecheck/lint/frontend tests passed; public health/routes and artwork checksum verified. Rollback container: `storefront-template-previous-20260916-044753`. No backend deployment or migration.


## 2026-09-16 checkout presentation review (NOT deployed)

Local checkout header now uses the neutral cart artwork via CheckoutHeading, instead of product.imageUrl. Checkout product row, quantity select, account/wallet panel, payment choices and summary type scale have dedicated styling. Mobile header omits decorative artwork. Shared ProductCheckout is rendered read-only in local dev preview at http://127.0.0.1:4175/checkout/demo. Quantity/payment-selection interaction and 320px layout verified without issuing an invoice. Frontend typecheck/lint passed after final UI adjustments; no payment matching/API/DB changes. Production remains release 20260916-044753 until approved deployment.


## 2026-09-16 checkout presentation deployed

After explicit owner approval, frontend release `20260916-050306` was built on Freestyle and deployed healthy. Includes neutral CheckoutHeading cart artwork, styled product/quantity row, account/wallet panel, accessible payment choices with a single selection indicator, compact payment summary and help link. VM typecheck/lint/frontend tests/build passed; public health, protected checkout route, updated CSS markers and cart artwork returned 200. Signed-in checkout interactions remain covered by the preceding isolated dev review; no real invoice/payment was created for acceptance. Prior container retained for rollback; no backend/schema changes.


## 2026-09-16 claim guidance dev preview (NOT deployed)

Local backend now exposes safe redeemUrl and instruction entities through paid/private Web order guidance; frontend renders claim button, rich-text/bare HTTPS links and guide attachments. Existing product fields only, no migration. Preview: http://127.0.0.1:4175/orders/DEMO-CLAIM-001 . See storefront/CLAIM_PREVIEW_REVIEW.md for validation and pending disposable DB test (Docker Desktop unavailable). Production remains 20260916-050306. Future approved deployment must include backend and frontend, not frontend alone.


## 2026-09-16 claim release completed

Owner approved claim deployment. Backend `telegram-app:claim-20260916` is active on Azure (image sha256:ebfb57f4fc1aa532a32e0afddeb481a3949d97bbbbd302141bd7a5972273de4e); frontend release `20260916-053805` is active on Freestyle. Six Web order/delivery DB integration tests + ten guidance policy tests passed in an isolated disposable PostgreSQL on the build VM; test DB/network removed. Both builds and public health passed; unsigned private-order request rejected 401. Backend workers running, environment and production DB container unchanged. No production migration. Config rollback backup: `/opt/telegram-store/backups/claim-20260916-1789537053`; backend rollback tag `telegram-app:rollback-claim-20260916`; frontend previous container retained.


## 2026-09-16 navigation simplification (pending dev review)

Removed Masuk Telegram from desktop SiteHeader and Buka Telegram from its mobile drawer. Admin support links are separate components. No new deployment for this local UI edit. Typecheck/lint validation requested; production remains 20260916-053805.


## 2026-09-16 navigation removal deployed

Frontend release `20260916-061711` deployed healthy after owner approval. Removed Telegram bot entry links from desktop header and mobile drawer. Chrome production check: both locations have zero t.me links; mobile menu still contains account login/register. Public health 200. SupportCard admin link is independent. No backend or database changes.


## 2026-09-16 pending copy removal

Owner deferred loading/animation design pending their reference and prioritized removing the product-page cart/stock helper sentence. Removed the safety-copy block below product purchase buttons locally. No skeleton/loading implementation or deployment performed for this change; production remains 20260916-061711.


## 2026-09-16 opening animation preview (NOT deployed)

Implemented paid-ready order sprite animation, once-per-order browser markers, skip/Escape, reduced-motion/image-failure fallbacks, and bounded read-only refresh for processing orders. Original six-frame user asset used unchanged. Preview http://127.0.0.1:4175/orders/DEMO-REVEAL . See storefront/ORDER_REVEAL_REVIEW.md. 920 root tests and 21 UI tests passed; frontend typecheck/lint and Chrome desktop/mobile review passed. No production update; pending copy removal also remains local.


## 2026-09-16 opening animation deployed

Frontend release `20260916-082219` deployed healthy after owner approval. Includes paid-ready once-per-order opening sprite, skip/Escape, read-only bounded processing refresh, reduced-motion fallback and prior product-helper-copy removal. Owner requested removing the progress dashes; those are absent from component and public CSS. Original sprite checksum verified from production; health 200. VM typecheck/lint/frontend tests/build passed; 21 UI regression tests passed before deployment. No backend or database changes.


## 2026-09-16 Web purchase announcements deployed

Backend `telegram-app:web-success-20260916` now queues one public success-channel announcement on the Web order completion transition after all first downloads. Uses order-level serialization plus receipt locking and stable outbox key. Worker checks paid/completed Web delivery, uses website-specific copy/CTA, and guards uncertain resend attempts. Digital Telegram purchase copy also refreshed with BWR Tele thank-you wording. Verified target @bwrtele_success and posting permission through read-only Telegram APIs; no test posts. 930 root tests and 32 isolated focused tests passed. No maintenance enabled, no production migration, DB container/environment unchanged, workers healthy. See storefront/WEB_SUCCESS_CHANNEL_RELEASE.md.


## Azure build policy (owner correction, 2026-09-16)

Build Telegram backend images locally on the Windows workstation (Linux amd64 Docker). Transfer finished images to Azure; Azure only loads/runs them because VPS capacity is small. Do not build this backend on Freestyle. See `deploy/MESSAGE_LAYOUT_RELEASE.md`.


## Web Codex login retrieval (2026-09-16)

`src/server/storefront/web-redeem.ts` serves login mappings for owned, paid,
delivered K12 Web inventory through GET/POST `/api/storefront/v1/orders/[invoice]/login`.
The storefront proxy and OrderLogin component use Clerk commerce access; original
product downloads now refresh the page after success. No JSON upload or Telegram
account link is needed for Web purchases. Existing AccountRedeemBatch/Event tables
record accesses under the established web:<customerId> identity (no migration).
Retrieval never allocates or changes stock and never queues Telegram messages.
See `storefront/WEB_CODEX_LOGIN_RELEASE.md` for ownership checks and validation.


## Admin product workspace UX (2026-09-16)

Add product / add variant now open `/admin/products/new` instead of a long modal.
The new page shares ProductEditForm with editing. Three tabs separate Info produk,
Media & panduan, and Pengaturan; fields stay mounted so file selections and rich
text survive tab switches. Validation reveals the first invalid field's tab.
Desktop has a live summary and save action on the right, mobile a sticky save bar.
Stock upload stays in the dedicated warehouse route; edit begins with catalog
information. Current server price/preorder constraints also apply in the form.
Create retains atomic broadcast behavior, returning its created product ID so a
standalone creation opens the edit page; group creation returns to its group.
Draft loss warnings do not persist private content in browser storage. See
`deploy/ADMIN_PRODUCT_UX_RELEASE.md` for production audit and synthetic UI checks.


## Storefront continuation, pagination and delivery UX (2026-09-16)

Guest Add uses Clerk modal with both sign-in/sign-up redirecting to the selected
product. `pending-cart-intent.ts` stores a one-hour tab-local owner-bound command;
retries preserve UUID plus expected revision to avoid duplicate additions.
Orders accept owner-scoped page/search/status queries (10 per page); summary
queries no longer load encrypted attachments. Shop loads public batches of 12
from the cached catalog. Popular carousel fills up to 10 and slides with hover,
focus, interaction and reduced-motion pauses. Profile menu loads live wallet
balance on open. Cart readiness includes Clerk initialization; loading skeletons
replace the previous false-empty flash. Wallet checkout now uses an explicit
styled confirmation modal, with captured quantity/method and a submission lock.

`/api/storefront/v1/orders/[invoice]/deliveries/bundle` provides private combined
TXT, Codex JSON or mixed ZIP. Single and bulk paths share order locking and atomic
receipt/stock finalization. Whole-order allocation, paid/provider state, receipt
owner and stock ownership are verified before decryption. All files are prepared
before updates; corrupted content rolls back the entire attempt. Repeated reads
return the same stock and completion queues one announcement. Limits: 100 files,
20 MiB. Individual downloads remain available. No migrations.
Details and acceptance evidence: `storefront/SHOP_CART_CHECKOUT_RELEASE.md`.


## Storefront search cache (2026-09-16)

Public catalog retains Next unstable_cache revalidation at 60 seconds, now with
in-flight request coalescing. New public search-index projection has max-age=60;
browser memory shares one index for 60 seconds across navbar/home/catalog inputs.
Typing matches locally and issues no search requests. Focus triggers index load;
failures back off 15 seconds. Weighted token/title matching and bounded OSA edit
distance support typo suggestions and consistent shop results. Private no-store
policies and authoritative checkout checks unchanged. Frontend release
20260916-160654 verified healthy; see storefront/SEARCH_CACHE_RELEASE.md.

### 2026-09-17 invoice UI audit (deployed storefront 20260917-003515)
- Storefront invoice presentation extracted to `components/orders/order-detail-view.tsx` and scoped CSS; compact state-specific header, desktop summary, mobile payment/download priority, paired-login help, download-again labels, refresh failure feedback, and invoice loading skeleton.
- ChatGPT browser generated two matched transparent illustrations; optimized assets in `storefront/public/illustrations/`. Consultation/provenance, preview routes, and validation in `storefront/INVOICE_UI_AUDIT.md`.
- Local build/typecheck/lint passed; 19 storefront tests passed. Seven invoice states checked at 390px without horizontal overflow. No backend/database/Telegram changes. Storefront release 20260917-003515 is healthy; public health and matching assets verified, signed-in invoice UI checked on desktop and 390px mobile.

## 2026-09-17 pending Telegram checkout UX and Binance activation
- Local changes allow five active Telegram invoices with a buyer-level transaction lock; Web retains one. Orders list prioritizes pending invoices. Same-message document replacement supports uniquely owned invoices and complete single bundles; navigation protects invoice/delivery messages. No production rollout yet.
- Home search stacking and mobile dropdown bounds fixed locally. See `deploy/TELEGRAM_CHECKOUT_UX_20260917.md` for scope, tests, and safe rollout limits.
- Binance HMAC reading-only key created after owner verification. Azure signed Pay History request succeeded; trade/withdrawal/transfer permissions false. IP restriction Save has not persisted (ipRestrict=false); user must complete it before activation. Private keys are only in ignored ACL-restricted local staging and private Azure staging, not runtime configuration/build context. No payment test or production method activation yet.


## 2026-09-17 Binance API and Telegram UX deployed
- Owner completed Binance IP restriction Save. Signed API checks from Azure show IP restriction enabled, Reading only, Pay History accessible. Browser dashboard UID matched configured recipient. Binance Pay enabled through central admin switch; official API verifier, no manual bypass. No real payment test performed.
- Backend `telegram-app:multi-invoice-20260917` deployed from locally built/transferred image. Azure loaded SHA `2d5dc39c1cdc07601f133cdc4bc486b2e80bf012f2de180f78d117d6f08a9e23`; archive rootfs/config verified. API credentials installed privately; other env settings preserved.
- Telegram allows five concurrent active invoices, protects invoice messages from navigation, and replaces uniquely owned invoice messages with a single complete delivery bundle where possible. See `deploy/TELEGRAM_CHECKOUT_UX_20260917.md` for fallback/large-order limits and 956 + 78 test validation.
- Frontend release `20260917-092647`: homepage search dropdown now layers above carousel and fits mobile viewport. Live Chrome checks passed. Backend/frontend healthy; workers running; no migration or direct customer-data operation.

## 2026-09-18 Binance receipt incident and navbar fix deployed
- Root cause confirmed from signed Binance Pay History: buyer receipt was provider `orderId`, different from `transactionId`; both strings. Verifier now accepts either exact identifier, locks/binds the actual provider transaction ID uniquely, preserves original submitted ID, and prevents cross-invoice alias reuse. Financial amount/receiver/time and terminal-state rules remain intact. No migration.
- Invoice TGS-20260917-868A38F1 has a verified incoming 5.621623 USDT payment before expiry, but remains expired with two products undelivered. IDR snapshot Rp104,000. No recovery/customer mutation performed; owner was asked to choose wallet credit, fulfillment, or handle themselves. Do not silently reopen or credit it.
- Clerk modal body overflow:hidden moved sticky navbar offscreen. Conditional CSS moves scroll lock to html and clips body without a new scroll root. Production actual guest modal verified with headerTop=0 on a scrolled page.
- Backend image `telegram-app:binance-receipt-20260918` active on Azure; frontend release `20260917-174227` healthy. 959 default tests and 117 disposable/focused tests passed. See `deploy/BINANCE_RECEIPT_INCIDENT_20260918.md` for fingerprints, audit and rollback.
- Binance was disabled and global maintenance enabled for cutover, then both restored after zero pending/ambiguous/expiry backlog and health checks. Environment and production DB container preserved.

## Clerk session origin repair - 2026-09-19
See storefront/AUTH_SESSION_RELEASE_20260919.md. Active storefront image: telegram-storefront:session-origin-20260919 on 202.74.74.205. Validated matching production secret; server commerce auth preserves original request token via getToken() without expiresInSeconds, since BAPI-minted replacement lacks required azp. Chrome Account/Orders/Wallet/paid detail/Checkout and Orders hard reload passed. Checkout maintenance reopened after service and worker checks.


## Shared manual crypto approval and sales counts - 2026-09-20
Current images: telegram-app:manual-sales-20260920 and telegram-storefront:sales-feedback-20260920 on 202.74.74.205. Active pending Binance/USDT invoices support reviewed admin approval through the existing confirmOrderPayment transaction; submitted reference and review note required, no expired-order reopening. Storefront soldCount is paid non-refunded unit count across channels, aggregated once per catalog fetch and displayed on cards/detail. Details and validation: deploy/MANUAL_APPROVAL_SALES_20260920.md. Maintenance reopened after service checks.


## Footer community links - 2026-09-20
Storefront image telegram-storefront:footer-community-20260920. Shared footer links admin, existing Sharing Session group, bot and Threads @buildwithreys_ai. Desktop/mobile Chrome checked; runtime group override STOREFRONT_TELEGRAM_GROUP_URL. See storefront/FOOTER_COMMUNITY_RELEASE.md.


## Footer theme refinement - 2026-09-20
Current storefront: telegram-storefront:footer-columns-20260920. Replaces contact cards with compact Belanja/Akunmu/Temui kami columns and right-side community CTA/social icons, retaining BWR white/light-blue/navy/blue palette per owner correction. Desktop and 390px Chrome verified, four external destinations unchanged. Typecheck/lint/build and 19 UI tests passed; storefront/backend health 200, remaining services running.


## Search Console preparation - 2026-09-20
Storefront image telegram-storefront:search-console-20260920. Runtime Google verification meta tag, robots.txt and dynamic sitemap.xml deployed; public sitemap verified with 52 unique catalog URLs and no private URLs. Private routes send noindex. Console ownership verification and sitemap submission still pending account confirmation. See storefront/SEARCH_CONSOLE_SETUP.md.

