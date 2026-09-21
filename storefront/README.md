# Telegram Storefront

Separate web storefront for the independent Telegram commerce application.

This is intentionally a separate deployable unit. It does not contain Prisma,
the Telegram database, stock encryption keys, payment secrets, bot tokens, or
the DANA/Shopee/Binance bridge.

## Current state

- Landing page, live catalog, product details, responsive authentication screens,
  and account-required pages are implemented.
- The health endpoint reports storefront health and backend configuration.
- The catalog refuses to invent products when the backend API is not connected.
- The API client uses HTTPS with timestamped HMAC to read the production catalog.
- Clerk production, account integration and database cart are active. Checkout
  is open for authenticated users. See `COMMERCE_ACTIVATION_RESULT.md` for the
  backup, deployment evidence, recovery requirements and remaining feature limits.

## Public VPS test deployment (2026-09-15)

- Primary URL: https://store.buildwithreys.com
- Previous preview URL: https://bwr-tele-a6fa78d4.style.dev
- Custom domain DNS, trusted HTTPS, and APP_URL activation are complete; see
  `DOMAIN_SETUP.md`. Clerk production and checkout activation are complete.
- Freestyle VM: `vm-a6fa78d4cf43495dabed6f7545c972da`
- Runtime directory: `/opt/telegram-storefront-freestyle`
- Current release: `releases/20260915-ui-fixes` (initial release: `releases/20260915-test`).
- Compose source: `docker-compose.freestyle.yml`; deployed as `docker-compose.yml`.
- Image: `telegram-storefront:freestyle-test`.
- HTTPS ingress routes to app port 3000. Container restart policy is
  `unless-stopped`; it does not depend on an interactive SSH session.
- Private runtime environment is outside the release/build context, mode 600.
- Active flags: `STOREFRONT_PREVIEW_MODE=false`,
  `STOREFRONT_PREVIEW_READ_ONLY=false`, `STOREFRONT_CLERK_COMMERCE_ENABLED=true`.
  Set read-only true during future maintenance to reject website API writes.
- Clerk uses production email/password authentication. Real buyer payment and
  delivery have not been exercised by the agent; the owner can now test them.
- The initial frontend deployment left Azure unchanged. The separately approved
  commerce rollout subsequently deployed the backend and additive cart migration.
- Validation: frontend typecheck/lint/build passed, container healthy, public
  health/catalog/auth/account-required pages returned HTTP 200, checkout POST
  returned the expected HTTP 503 preview lock.

### UI fixes deployed after audit

The 2026-09-15 UI audit fixes are live. Product detail fits 320/390 px screens;
category/search/sort/availability filters preserve each other; mobile includes
a category selector; ungrouped category badges lead to `/shop`; the static
success URL redirects to authenticated orders. The deployment also adds a
runtime preview notice, a branded 404, smaller detail headings, readable bullet
spacing, and Indonesian authentication placeholders.

Build, typecheck, lint and four filter regression tests ran on the Freestyle
VPS. A candidate container on loopback port 3002 passed HTTP smoke checks before
the public container was replaced. The candidate was removed afterward.

- Current image: `sha256:59687cc61788db97a119e483b34e10909fa1fcfe3984fbaa757fc4719dee76c2`
- Rollback image: `telegram-storefront:pre-ui-20260915`
- Deployment record: `/opt/telegram-storefront-freestyle/ui-deploy-state.json`
- Config/image backup: `/opt/telegram-storefront-freestyle/backups/20260915-ui-fixes`
- Runtime environment remained unchanged; checkout is still locked.
- One-off release scripts: `../deploy/storefront-ui-build.py` and
  `../deploy/storefront-ui-promote.py`. They target only this Freestyle frontend,
  include release-specific checks, and must not be reused unchanged for a new release.
- Regression command: `node --experimental-strip-types --test tests/shop-filters.test.mjs`

## Local run

1. Run npm.cmd install.
2. Copy .env.example to .env.local.
3. Run npm.cmd run dev.

## Separate Docker deployment

1. Run npm.cmd install --package-lock-only.
2. Build the telegram-storefront:production image.
3. Copy .env.example to .env.production on the website VPS.
4. Run docker compose up -d.

The production VPS must have its own environment file, Docker project, Caddy
volumes, domain, and deployment backup. Do not copy the Telegram VPS
environment file or PostgreSQL volume.
