# Clerk session and navigation repair - 2026-09-19

Production storefront: https://store.buildwithreys.com

## Verified cause

The storefront previously had an invalid production Clerk secret (Clerk BAPI
returned 401). Runtime configuration was corrected to the matching valid
production instance. This alone did not repair commerce account access.

`auth().getToken({ expiresInSeconds: 60 })` invokes Clerk BAPI to mint a new
token. A production diagnostic of that path returned HTTP 200, matching
issuer and session ID, lifetime 60 seconds, but **no azp claim**. The Telegram
commerce verifier requires the authorized browser origin and correctly
rejects that replacement token. The resulting error was misleadingly shown
as an expired user session across Account, Orders and Checkout.

## Change

- Use `auth().getToken()` without options. The installed Clerk SDK returns
  the already verified request token, retaining azp and avoiding a network
  token-mint request on each authenticated page.
- Preserve strict backend signature, issuer, origin, session and time checks.
- Background cart cleanup now asks Clerk for a fresh token before signing
  out. If Clerk can still issue a token, a backend rejection does not destroy
  the global session.
- Add route loading skeletons for Orders, Account (including Wallet), Product
  and Checkout. Private customer data remains uncached.

## Validation and deployment

- Two server-token regression tests passed, including preservation of the
  original request token and anonymous isolation.
- 34 auth/cart tests and 19 storefront interaction tests passed.
- Docker build includes typecheck, lint, four filter tests and Next build.
- Built locally; transferred compressed image and verified SHA-256 before
  loading on VPS. Active image: `telegram-storefront:session-origin-20260919`.
- Chrome using the existing signed-in session showed account data, four
  historical orders, wallet history, paid-order detail and checkout buyer
  identity. Hard reload of Orders retained access. No expired-session or
  account-setup prompt on these verified pages. No purchase was submitted
  and no credential file was downloaded during acceptance.
- At a 390px Chrome viewport, Orders loaded correctly. This is responsive
  desktop-browser validation, not a test on the user's physical phone.
- App/database/storefront health passed; Caddy and both worker containers
  running. Scheduler and notification-worker resolve `app` uniquely on the
  backend network. Worker logs had no new errors, notification retry/failed/
  manual-review counts were zero and webhook pending count was zero.
- Payment-worker endpoints returned HTTP 200. This checks endpoint operation,
  not a new real payment or every provider's business configuration.
- Existing migration container exit 0; no migration or direct production
  database operation performed for this repair. Checkout maintenance reopened
  after checks; catalog returned 44 products and three payment methods.

## Deployment checks to retain

Validate production Clerk credentials against BAPI and confirm the exact
primary domain; a `sk_live_` prefix alone is insufficient. Verify actual
signed-in Account and Orders data in Chrome, not only the profile avatar,
page heading, container health, or anonymous probes. Do not use BAPI-minted
tokens to replace browser session tokens where azp is required.

Next 16 Node proxy entries live in `functions-config-manifest.json` under
`/_middleware`; an empty edge `middleware-manifest.json` alone does not mean
the Clerk proxy is missing.
