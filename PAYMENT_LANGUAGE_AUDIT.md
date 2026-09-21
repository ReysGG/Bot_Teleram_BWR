# Payment and Telegram language audit — 2026-09-05

This is a local candidate. No deployment, production database inspection,
production migration, real transfer, or customer-message send was performed.
Only public health, environment-presence booleans, and public BSC RPC reads
were checked on the Azure `Telegram-BOT` application.

## Findings and implemented changes

### Binance Pay

The repository already contains a separate Binance Pay provider, recipient
settings page (`/admin/payment-settings/binance`), ledger
(`/admin/payments/binance`), invoice snapshots, Order ID collection, signed
read-only transaction-history verification, and a scheduled verification worker.

The buyer workflow is:

1. Create an invoice and copy its recipient Binance UID and exact USDT amount.
2. Transfer through Binance Pay and wait for Completed in Binance.
3. Tap the paid button and send the Order ID from Payment Details as text.
4. Verify incoming history: one matching ID, positive exact USDT amount,
   matching recipient UID, supported transfer type, and invoice payment window.
5. Confirm payment transactionally and enqueue stock fulfillment once.

The candidate closes these gaps:

- Numeric app receipts match the documented `M_P_` history representation
  automatically, without converting long IDs to JavaScript numbers.
- Numeric/prefixed aliases are checked together for reuse. A PostgreSQL
  transaction-level receipt lock serializes claims across different invoices.
  Existing canonical IDs remain readable; no data rewrite or migration is needed.
- HTTP 200 is insufficient: an object response must include `success: true`
  and `code: "000000"`. Malformed transactions are rejected by the API client.
- Recipient and amount copy buttons use immutable invoice values and plain
  decimal amounts. Both Indonesian and English labels are available.
- The Order ID prompt saves the actual replacement Telegram message ID.

The official Pay history contract documents signed
`GET /sapi/v1/pay/transactions`, the `M_P_` example, positive incoming versus
negative outgoing amounts, and separate receiver `binanceId` (UID) and
`accountId` (Pay ID): https://developers.binance.com/docs/pay/rest-api

Read-only production check: `BINANCE_API_KEY` and `BINANCE_API_SECRET` are
absent in the running application. `BINANCE_PAY_RECIPIENT_ID` is also absent;
a database recipient override was not inspected. Missing API credentials alone
prevent effective Binance checkout availability. The screenshot is a workflow
reference, not authorization to use its recipient as the store's destination.

Before live activation, configure the store's recipient UID, a read-only API
key/secret for that same receiving account in server environment, the shared
IDR/USDT rate, and the provider enable switch. Do not grant trading or withdrawal
permissions or put real credentials into this document. The configured key must
be able to read Pay history; a controlled real transfer remains an operator test.

### USDT BEP20

The existing path verifies BSC mainnet, receipt success, the snapshotted token
contract and destination, exact token units, a unique Transfer log, invoice
time, and required block confirmations. Transaction hashes are unique and
confirmation uses the same transactional stock/outbox path as other payments.

The candidate adds direct verifier regression tests and fixes stale checks that
could downgrade terminal attempt status. It also rejects malformed block
timestamps/progress, guards hash submission against a non-pending order, checks
that the VERIFIED transition was won, and isolates retryable fulfillment errors
so one order cannot stop the rest of the worker batch.

Read-only production check: public health returned `ok: true, database: ready`.
The application's public BSC fallback returned chain ID `0x38` (56) and a head
block. No custom `BSC_RPC_URL` is present. This proves RPC connectivity, not a
real payment or the current database-controlled recipient/enable settings.

### Indonesian / English

The existing local catalog candidate supports separate reviewed English
descriptions and formatting entities, locale selection/persistence, translated
catalog navigation and broadcasts, and Indonesian fallback for missing English
content. Binance, BEP20, Jago and wallet-topup invoice presenters, payment-success
messages and delivery presenters already include locale-aware paths.

This candidate extends localization to payment-method selection and blocked
prompts, order list/detail/status, cancellation screens, and callback recovery.
The active-invoice checkout failure now carries the actual order ID and invoice
number. Telegram shows an Indonesian/English explanation and a button to open
that invoice instead of the former generic request-failed message.

Coverage is still partial: wallet overview/history, referral, SMS purchase and
search, redeem workflows, some QRIS/wallet checkout messages, and several
operational notifications retain Indonesian text. Admin pages remain Indonesian.
Operator-authored maintenance, preorder and product content is not automatically
translated. There is no machine-translation provider configured.

## Validation and rollout boundary

The disposable PostgreSQL 17 instance used a separate loopback port and temporary
storage. All 41 existing migrations applied successfully. The provider,
product/catalog and payment-contention database suites passed 15 tests, including
concurrent alias claims, concurrent confirmation/delivery deduplication, hash
reuse rejection, immutable snapshots and active-invoice identity recovery.

The final full unit/flow suite passed 667 tests (41 database tests skipped by
default); the selected database suites passed the 15 tests reported above.
TypeScript, full ESLint, changed-file ESLint and Prisma validation passed.
The production build passed using Webpack/WASM fallback
on this Windows environment because the installed native SWC binary cannot load;
existing cache warnings are unrelated to the payment changes.

No new migration is introduced by this payment patch. The previously existing
local multilingual migration `20260902223000_add_catalog_english_descriptions`
is still required for this candidate as a whole; the runbook records that it has
not been deployed. Migration state was not queried in this audit. It adds nullable English description/entity
columns and JSON-array constraints without rewriting customer/business rows.
Production migration/deployment requires the explicit database authorization
and maintenance/audit procedure in `AGENTS.md` and `PROJECT_COMPACT.md`.

Provider integration tests are explicitly gated by
`RUN_PAYMENT_PROVIDER_DB_TESTS=1` and require a local test/audit database name.
Never enable database test flags against production or real local business data.
