# SMS OTP website — functional draft and design review

## Status

Implemented locally on 2026-09-21. Not deployed or enabled in production.
Docker is running locally again. Initial backend/frontend Docker builds completed;
the latest catalog/logo refinements require one final image rebuild later.

## Routes

| Surface | Route | Purpose |
| --- | --- | --- |
| Website | `/sms` | Service/country selection, quote, wallet summary, confirmation |
| Website | `/sms/orders` | Owner-scoped history with pagination |
| Website | `/sms/orders/[id]` | Number/OTP, status, timer, refresh, cancellation |
| Website proxy | `/api/sms` | Authenticated catalog/history/purchase proxy |
| Website proxy | `/api/sms/orders/[id]` | Authenticated detail/refresh/cancel proxy |
| Backend | `/api/storefront/v1/sms` | Signed request + Clerk ownership + shared purchase |
| Backend | `/api/storefront/v1/sms/orders/[id]` | Read and mutate only the verified owner's order |

## Money and ownership

- Uses the existing SMSPool customer-order, wallet ledger, provider purchase,
  polling, cancellation and refund implementation. No second settlement flow.
- Original Telegram entry retains its private-chat guard. A separate web entry
  resolves an existing Clerk-linked customer and derives `web:<customerId>` on
  the server. No caller-provided owner/customer/chat ID is accepted by the API.
- Purchase keys are namespaced per web customer. Duplicate/concurrent requests
  reuse the same order and cannot debit twice. Reusing a key for another service
  or country is rejected.
- The displayed expected price must match a fresh quote before debit; existing
  provider max-price and price-difference/refund behavior stays shared.
- Global checkout maintenance and wallet disable switches apply to new web SMS
  purchases. History and existing order actions remain readable when new web SMS
  purchases are disabled.
- Wallet balances are separate from Telegram. Website top-up is still unavailable;
  the UI explicitly says so and disables purchase when current website funds are
  insufficient. No SMS number was actually bought during implementation/testing.
- No schema migration required. `STOREFRONT_SMS_ENABLED=false` is the backend
  default; enable only after final release verification and provider readiness.

## Frontend structure

Existing global CSS + feature CSS Modules; Tailwind was not introduced.
Reused existing `SiteHeader`, `SiteFooter`, `Icon`, `ConfirmationModal`, Clerk
token transport and API signing infrastructure. New reusable SMS components:

- `SmsPanel`, `SmsStatusBadge`, `SmsCopyButton`, `SmsEmptyState`, `SmsWaitingIllustration`
- `SmsServicePicker`, `SmsCountryPicker`, `SmsPurchaseSummary`
- `useSmsRequest` for authenticated calls and a single fresh-token retry

The picker uses the complete public SMSPool service snapshot (1,386 services),
searches across all services, and displays 24 cards per page. Public service
metadata is cached for five minutes with request coalescing. 158 exact service
names have local hashed Simple Icons assets; the remaining services use a neutral
phone fallback because the provider catalog does not publish icon URLs. Assets are
served locally with one-year immutable caching and never fetched per card from a
third party.

Account switches remount private SMS state so a prior customer's number/code is
not retained on screen. Active detail pages poll local order state every ten
seconds only while visible; existing scheduler polls the provider. Manual refresh
and cancellation remain explicit actions with pending/confirmation states.

## Visual work

Requested through Chrome ChatGPT at:
https://chatgpt.com/c/6ab0e2bf-e9ac-83ec-8a1b-140109bbf51f

Local uploads were blocked by Chrome's file-URL permission, so public BWR Tele
asset links were supplied instead. Only public branding and synthetic examples
were provided, not tokens/customer/stock data. Outputs are in `design/sms/`:
desktop/mobile mockups, transparent hero, transparent waiting illustration.
Optimized actual website assets are `public/sms/hero.webp` (85,020 bytes) and
`public/sms/waiting.webp` (29,984 bytes).

The mockups are concepts, not authoritative UI/data. They contain illustrative
stock counts and a stylized logo; production components retain the real logo and
do not invent availability counts. The corrected mobile concept is saved as
`design/sms/mobile-mockup-final.png`; the live UI keeps the real BWR Tele header,
actual service data, and the floating-help gutter.

ChatGPT review was received and considered: shared header/pickers, price and
remaining-wallet summary, shared confirmation, state-specific number/OTP UI, and
separation of help buttons from purchase controls. The implementation keeps the
existing responsive theme and reserves room beside mobile actions.

## Validation completed

- Default root suite: 1,010 passed; 80 optional DB tests skipped in that run.
- New isolated PostgreSQL tests: 8 passed, covering single/concurrent purchases,
  insufficient balance, changed quote, maintenance/wallet switch, provider failure
  refund, ownership, request conflicts, Telegram guard and idempotent cancellation.
- Signed route/owner tests: 5 passed (included in the default suite).
- Frontend SMS tests: 7 passed, including confirmation, displayed-price payload,
  insufficient funds, signed-out behavior, owner switching and repeated selection.
- Initial TypeScript/lint/backend/frontend image builds passed before Docker was
  paused. Subsequent local typecheck/lint are used for final source refinements.
- Chrome local preview: service/country -> confirmation -> simulated number ->
  refresh -> simulated OTP successfully completed. Only local mocked provider
  responses were used.

## Before production activation

Rebuild both images with Docker when the user resumes it; include the final
assets. Review schema-free release, validate Compose and all dependent services,
then enable the backend feature flag deliberately. Verify live private-route
authorization and ownership with non-financial checks. An actual paid SMS test
requires a separately authorized recipient/service and spending limit. Do not
report live purchasing or real-provider delivery as already verified.
