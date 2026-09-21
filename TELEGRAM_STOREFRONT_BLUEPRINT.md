# Telegram Storefront Blueprint

Status: scaffold created on 2026-09-14. The website is not connected to the
production Telegram API yet.

## VPS Map

### Telegram commerce backend (current)

    Public URL : https://70-153-137-10.sslip.io
    Host       : 70.153.137.10
    User       : azureuser
    SSH key    : %USERPROFILE%\.ssh\telegram-store-azure
    App path   : /opt/telegram-store
    Compose    : /opt/telegram-store/docker-compose.yml
    Env        : /opt/telegram-store/.env.production
    Production : Telegram bot, PostgreSQL, payment workers, stock, wallet,
                 encrypted fulfillment, DANA bridge and Shopee worker

### Website storefront (new)

    Folder     : storefront/
    VPS        : TBD
    Domain     : TBD
    Compose    : storefront/docker-compose.yml
    Database   : none in the initial scaffold
    Status     : local scaffold only; not deployed

The current Telegram VPS is therefore recorded. The website VPS must remain a
separate host and Docker project when its domain/SSH details are available.
The storefront app, Caddy, public assets, image optimization, and browser
traffic must never be deployed on 70.153.137.10 because that host is already
reserved for payment, Telegram, PostgreSQL, stock, and worker workloads.

## Ownership Boundary

The website owns presentation, browse/search state, short-lived web sessions,
and the server-side API client. The Telegram backend remains the only owner of:

- product and variant truth;
- prices, vouchers, payment methods, invoices, and payment matching;
- wallet ledger and refunds;
- stock reservation, expiry, health checks, and encrypted digital inventory;
- order lifecycle and Telegram delivery;
- DANA, Shopee, Jago, Binance, and BEP20 provider credentials/events.

The website must never:

- import the parent Prisma client;
- connect to the Telegram PostgreSQL host or volume;
- receive stock ciphertext/encryption keys;
- receive bot tokens, bridge secrets, provider cookies, or payment secrets;
- implement a second checkout/refund/stock allocator;
- trust a browser-supplied Telegram chat ID as authentication.

## Connection Shape

    Browser
       |
       v
    Website VPS (Next.js + Caddy)
       |
       | server-to-server HTTPS only
       v
    Telegram backend VPS (authenticated service API)
       |
       +--> PostgreSQL / workers / Telegram Bot API / payment providers

The browser never sees the shared API secret. The website server calls a
versioned backend API with:

    X-Storefront-Key-Id
    X-Storefront-Request-Id
    X-Storefront-Timestamp
    X-Storefront-Signature

The signature canonical form is:

    timestamp.request_id.HTTP_METHOD.path.sha256(raw_body)

The backend should reject stale timestamps, reused request IDs, unknown key IDs,
bad signatures, and requests outside the endpoint allowlist. Checkout requests
also require a separate idempotency key owned by the website session.

Public catalog traffic must be absorbed by the website VPS:

- cache category/product presentation for a short 30-60 second window;
- generate one signed backend request only on cache miss/revalidation;
- serve product images from the website cache/CDN when an immutable public
  media URL or versioned asset endpoint is available;
- use stale-if-error for catalog browsing, while checkout always fails closed
  if fresh backend validation is unavailable;
- never poll order/payment status from every open browser tab. Use bounded
  refresh/backoff or a storefront-side status endpoint.

The initial client boundary is in storefront/src/lib/telegram-store-api.ts.
It intentionally fails closed while TELEGRAM_STORE_API_BASE_URL,
TELEGRAM_STORE_API_KEY_ID, and TELEGRAM_STORE_API_SHARED_SECRET are blank.

## Proposed API Contract

These are design targets, not live production routes yet:

    GET  /api/storefront/v1/catalog
    GET  /api/storefront/v1/products/{productId}
    POST /api/storefront/v1/auth/telegram
    POST /api/storefront/v1/checkouts
    GET  /api/storefront/v1/orders/{orderId}
    POST /api/storefront/v1/orders/{orderId}/open-telegram

The catalog response may expose public product presentation and availability
tiers, but never encrypted stock, provider evidence, internal fingerprints,
customer wallet data, or payment credentials.

Telegram Login Widget data must be verified by the website server using the
official Telegram hash contract. The website then exchanges the verified
identity with the Telegram backend for a short-lived opaque web session. The
backend, not the browser, maps that identity to a Telegram chat.

Checkout should be a two-step server flow:

1. Website sends a signed create-checkout request with a server-generated
   idempotency key and the verified web-session token.
2. Backend creates the canonical invoice/order and returns only the public
   payment instructions/status token needed by the website.

Payment confirmation, stock allocation, delivery, and wallet recovery continue
to happen only in the Telegram backend. The website can show status and a
button to open the private Telegram chat; it must not mark an order paid.

## Separate Docker Operations

The website compose file has only app and Caddy services. It has no PostgreSQL
volume and no dependency on /opt/telegram-store. Deploy it on the future VPS
with its own:

- domain and TLS storage;
- .env.production;
- image tag and rollback tag;
- backup of configuration;
- health check at /api/health;
- log rotation;
- firewall rule allowing only HTTPS publicly.

The first website deployment should not require a database migration. If a
future website database is introduced for sessions/cache, it must have its own
volume, migration image, backup, and rollback policy.

## Recommended Rollout Order

1. Agree on the API schema and service key ownership.
2. Implement backend read-only catalog endpoints first.
3. Deploy the website with API integration disabled and verify health/TLS.
4. Enable catalog reads with bounded timeouts, cache headers, and fail-closed
   empty/error states. Confirm repeated page views hit the storefront cache
   instead of PostgreSQL on the Telegram VPS.
5. Add verified Telegram login and an opaque session exchange.
6. Add checkout creation with idempotency and an explicit open-in-Telegram
   delivery handoff.
7. Run disposable API contract tests and a small controlled production smoke.
8. Only then consider browser checkout/payment UX; never duplicate provider
   matching in the website.

## Current Scaffold Files

    storefront/Dockerfile
    storefront/docker-compose.yml
    storefront/Caddyfile
    storefront/.env.example
    storefront/src/app/page.tsx
    storefront/src/app/catalog/page.tsx
    storefront/src/app/api/health/route.ts
    storefront/src/lib/telegram-store-api.ts

## Web Order and Delivery Extension (2026-09-15)

The storefront and Telegram bot use one backend database and one business API.
The website does not own a second catalog, wallet, payment matcher, stock
allocator, or fulfillment database. `Order.channel` distinguishes `TELEGRAM`
from `WEB`; both channels use the same price, payment, reservation, refund, and
idempotency logic.

Web access is password-protected without storing the password in plaintext:

- `WebCustomer` stores a keyed contact lookup hash, masked email, and bcrypt
  password hash.
- `WebCustomerSession` stores only a hash of the short-lived opaque session
  token.
- Order lookup requires the contact email or invoice plus the checkout password.
- The storefront server keeps the opaque token in an HttpOnly cookie; the
  browser never receives the shared backend API secret.

### Clerk migration boundary

The storefront UI now has a Clerk authentication foundation linked to
application `app_3JLkORzgGrGJAitRHvP3wrCFqhu`. Clerk provides the account
sign-in/sign-up/profile session at the website layer, but it does not yet own or
authorize commerce records. The existing `WebCustomer` password session remains
the order/wallet/download authority until the following boundary exists:

```text
Clerk browser session
  -> storefront server verifies/reads Clerk session
  -> signed service request carries a short-lived Clerk identity assertion
  -> Telegram backend verifies the assertion
  -> immutable Clerk user ID binding resolves exactly one WebCustomer
  -> normal order/wallet authorization continues with that WebCustomer ID
```

Never bind or authorize by an unverified email string alone. Linking must fail
closed on an existing-email collision and require proof from both identities or
an explicit recovery workflow. Wallet, refund, invoice search, delivery, and
download access must continue using one canonical backend customer ID. The old
password flow cannot be removed until migration and account-recovery tests pass.

Current Clerk implementation details:

```text
Provider : ClerkProvider inside body
Proxy    : src/proxy.ts
Matcher  : /(api|trpc)(.*), then /__clerk/:path*
Routes   : /sign-in/[[...sign-in]], /sign-up/[[...sign-up]]
Controls : signed-out Masuk/Daftar, signed-in UserButton
Locale   : official idID localization
Secrets  : ignored environment only
```

Both auth routes reuse one full-width responsive split-screen shell and one
Clerk appearance configuration. The supplied character scene fills the left
panel as a background instead of appearing as a nested image rectangle. The
storefront auth surface presents email and phone-number entry and hides social
provider controls. This is presentation only and does not change the immutable
Clerk-to-`WebCustomer` binding requirement described above.

The landing-page benefit section is also a reusable responsive component rather
than page-local markup. Desktop, tablet, and mobile intentionally use different
compositions while sharing one benefit data source. Decorative raster artwork
is hidden outside desktop; semantic linked benefit content remains available at
every breakpoint.

Digital delivery is channel-aware and stock-safe:

- Telegram orders continue using `TelegramNotification` and the Telegram
  delivery worker.
- Web orders create a `SentDelivery` receipt with `channel=WEB` and
  `status=READY`; the file is decrypted only when the authenticated customer
  downloads it.
- `SentDelivery.stockItemId` remains globally unique, so a stock credential
  cannot be delivered through Telegram and Web at the same time.
- The first Web download atomically marks the receipt and stock delivered;
  repeated downloads reuse the same receipt and never allocate another item.

The local test environment is intentionally data-minimized. It uses a fresh
disposable database with current migrations and copies only `ProductGroup` and
`Product` rows from production. Customer, order, payment, wallet, provider
session, and encrypted production stock data are not copied. Synthetic local
stock and a local QRIS merchant are used for checkout/delivery tests.

Implemented local API routes:

```text
/api/storefront/v1/catalog
/api/storefront/v1/access
/api/storefront/v1/access/revoke
/api/storefront/v1/checkouts
/api/storefront/v1/orders
/api/storefront/v1/orders/{invoice}
/api/storefront/v1/orders/{invoice}/qris
/api/storefront/v1/orders/{invoice}/deliveries/{receiptId}
/api/storefront/v1/orders/{invoice}/attachments/{productId}
/api/storefront/v1/orders/{invoice}/payment-reference
/api/storefront/v1/orders/{invoice}/payment-refresh
/api/storefront/v1/orders/{invoice}/cancel
/api/storefront/v1/orders/{invoice}/test-confirm
```

`test-confirm` exists only behind the explicit localhost-only test gate and
must return 404 in production. Product guidance and attachments are returned
only for entitled paid Web orders. The same policy is reused by order detail
and binary download so refunded/unpaid orders cannot receive either the text or
the file. Once payment is confirmed, the storefront hides provider payment
instructions to prevent accidental duplicate payment.

Production API rollout remains a separate explicit step. The current
production endpoint is not enabled until the additive migration, image
rollout, signed smoke test, and rollback check are approved.
