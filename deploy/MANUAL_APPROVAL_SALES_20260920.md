# Manual approval and storefront sales - 2026-09-20

## Payment path

The user explicitly requested manual approval for Binance and USDT and one
shared payment path. `approveOrderPaymentManually` still invokes
`confirmOrderPayment`; provider-specific code only claims references and
updates provider state inside that same transaction. Stock allocation,
payment state, refunds for unavailable stock, and delivery enqueueing are
not duplicated.

`adminOrderPaymentRecoveryAction` offers `REVIEW_MANUAL_CRYPTO` for active
pending invoices. Dashboard, order list/detail and both crypto ledgers use
`AdminOrderPaymentAction` and link to
`/admin/orders/[id]/payment-approval`. This page shows expected USDT and
the recipient snapshot and requires a transaction reference plus a 10-500
character review note before the existing confirmation modal submits to
`/api/admin/orders/[id]/confirm`.

Only the authenticated admin service may provide the explicit manual approval
payload. The automatic path still requires provider evidence. Manual approval
does not fabricate `verifiedAt`, blockchain confirmations or observed provider
metadata. Payment retains `verifiedBy=admin:...`, and provider failureReason
records `MANUAL_APPROVAL: ...`; the ledger displays `Lunas · manual`.

Existing references cannot be replaced by unrelated ones. USDT hashes use the
existing unique constraint, Binance aliases use the same receipt lock and
deduplication as the automated path. Provider attempts become CONFIRMED in
the payment transaction and are excluded from pending worker selection.
Expired/cancelled/refunded orders are not reopened by this approval path.

## Sales display

The catalog has an additive `soldCount` per product. One grouped OrderItem
query counts paid units in PAID, PAID_WAITING_STOCK, FULFILLING or COMPLETED
orders, with refundedAt null, across Telegram and Web. Each OrderItem is one
unit. The storefront displays exact locale-formatted units on product cards
and detail pages. Missing data during rolling upgrades remains hidden instead
of being presented as zero. Public catalog cache remains 60 seconds; there
is no per-card request and no schema migration.

## Authentication presentation

Login/register success feedback renders a short animated check without
changing Clerk redirects, tokens or account identity. A short-lived timestamp
and mode in sessionStorage preserve presentation across hard redirects.
Already-signed-in page loads do not replay the animation. Reduced motion is
supported. Tests cover StrictMode, login, registration, hard redirects,
stale markers and unknown sales counts.

## Validation

- 983 normal tests passed; 70 integration tests skipped in the normal suite.
- 14 payment-provider tests passed against a new local PostgreSQL database
  `telegram_approval_test` on 127.0.0.1:55441, including manual approval,
  concurrent duplicate aliases, one delivery per unit, expiration rejection,
  unchanged automatic provider checks, and sales exclusion after refund.
- Six storefront sales/auth-feedback tests passed.
- Root and storefront TypeScript/lint passed; both Docker production builds
  succeeded locally.
- Images: telegram-app:manual-sales-20260920 and
  telegram-storefront:sales-feedback-20260920.
- No production payment is manually approved as a deployment smoke test.

The requested exchange-rate setting and rate-control UI remain unchanged.

## Production verification

Both images deployed on 2026-09-20 after checksum verification and Compose
validation. Global checkout maintenance was enabled during rollout and
reopened after public/internal health, catalog and worker checks passed.
Catalog returned 44 products with valid nonnegative integer soldCount fields
(43 nonzero). Chrome showed sales on the catalog cards and product detail.
The new approval page rendered through the existing admin session and correctly
withheld the approval form for an expired invoice. Current crypto ledger rows
were expired, so no live financial approval was submitted; active/manual
settlement and concurrency were verified in the isolated database tests.

Notification worker processed/retry/failed/manualReview were all zero at the
smoke check, Telegram pending webhook count was zero, and the Binance, USDT,
Shopee, matching and expiry worker endpoints returned 200. Both worker
containers continue resolving app only on the private backend network.
Existing migration job was started by Compose dependencies and completed
with `No pending migrations to apply`; no schema migration was applied.
Database volume and application environment values were preserved.
