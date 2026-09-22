# Independent Telegram Store - Agent Instructions

## Production bot boundary — explicit user instruction, 2026-09-22

- `@K12JsonStockBot` (Telegram bot ID `8875520688`) is the PRODUCTION bot.
- Never use its token in local/test environments, polling runners, fixtures,
  test webhook configuration, or test messages. Never change its webhook for testing.
- Create and verify a separate test bot before enabling any local Telegram sender
  or poller. Empty test credentials must fail closed; never fall back to production.
- No production deployment is authorized for the current local admin/seller work.

## Required Reading

Before changing code in this workspace, read these files completely:

1. `PROJECT_COMPACT.md` for the canonical current architecture and production runbook.
2. `PROJECT_CONTEXT.md` for historical decisions and incident detail.
3. `DANA_BRIDGE_TELEGRAM_BLUEPRINT.md` as a reference for the existing bridge behavior only.

## Objective

Build a completely independent Telegram commerce application in this directory.

The new project owns its own:

- brand and Telegram bot;
- product catalog and variants;
- admin/product management;
- cart, voucher, checkout, and pricing;
- customer/session data;
- order and payment records;
- stock reservation and expiry;
- encrypted digital stock and fulfillment;
- notification outbox and workers;
- database, deployment, environment variables, and secrets.

The project must not import, call, or share business data with BuildWithReys Market Project. Do not create a Market Project integration API. Do not share Prisma models or database tables.

The only shared infrastructure is DANA Bridge. Treat the bridge as a neutral payment-event transport, not as a BuildWithReys API.

## DANA Bridge Boundary

The existing Android bridge is reference implementation and may be reused or extracted. The independent bot must have its own payment matching and confirmation records.

If one Android device serves more than one store, do not broadcast the same notification blindly to multiple stores. Use a neutral bridge relay with a global active-payment registry and route each event to exactly one owner system. Otherwise equal active amounts can cause two stores to confirm the same DANA notification.

Do not move or duplicate the Android application until the relay/routing design is explicitly selected.

## Current Status

- The independent bot, admin web app, PostgreSQL schema, Android bridge, Docker
  deployment, and production workers are implemented and active.
- Production is the Azure Docker Compose stack documented in `PROJECT_COMPACT.md`.
- Use the compact map before recursively searching the repository.
- No credential or secret may be added to source files or documentation.

## Safety Rules

- Never copy real Telegram tokens, database URLs, DANA secrets, encryption keys, or admin credentials into source files or chat output.
- Use `.env.example` placeholders and keep `.env*` ignored.
- Never modify, migrate, truncate, reset, restore, reseed, delete, or directly inspect the production database unless the user explicitly authorizes that exact production database operation in the current request. Code changes, builds, and migration validation must use an isolated disposable database by default.
- Never run `prisma migrate reset`, `prisma db push --force-reset`, destructive SQL, `docker compose down -v`, or remove/recreate the production PostgreSQL volume. A normal production deployment does not authorize a database mutation beyond an explicitly reviewed additive `prisma migrate deploy`.
- Preserve idempotency for Telegram updates, checkout creation, payment events, stock allocation, and digital delivery.
- Never send the same digital credential twice.
- Never confirm one DANA notification in more than one store.
- Use exact amount and payment-window matching with an ambiguity-safe failure mode.
- Store digital inventory encrypted at rest.
- Keep payment and stock changes transactional and covered by tests.
- For a production incident involving order, payment, wallet, stock, delivery,
  or other customer data, enable global checkout maintenance before deploying
  or running recovery. Keep maintenance enabled until the affected-data audit,
  worker reconciliation, and public health checks pass; then disable it only
  after explicitly verifying that new checkout is safe.
- Do not modify BuildWithReys Market Project unless the user explicitly asks for bridge extraction or relay integration.

## Recommended Architecture

```text
Telegram -> Independent Store App -> Independent PostgreSQL
                    |
                    -> Neutral DANA Bridge Relay
                           -> routed payment event for this store only
```

The independent store should remain functional without any BuildWithReys service or database.

## Validation

When implementation begins, add and run:

```bash
npm test
npx --no-install tsc --noEmit
npm run lint
npm run build
```

Do not claim readiness until webhook authentication, payment-event idempotency, amount collision handling, stock concurrency, expiry restoration, and delivery deduplication are tested.

## Change and Deployment Verification

- After every code, configuration, image, Compose, environment, or deployment
  change, inspect the complete service set before reporting success.
- Check the database, app, migration result, scheduler, notification worker,
  payment workers, storefront, reverse proxy, and any bridge or relay service
  affected by the change. Do not check only the service that was edited.
- Validate Compose configuration before restarting services. After a restart,
  verify container state, health checks, image names, dependencies, networks,
  volumes, and worker commands.
- Call the relevant public and internal health endpoints, then run the affected
  cron or worker endpoints once with the configured authorization. Confirm the
  response status and a safe summary of the result without printing secrets or
  customer data.
- When a VPS is involved, also verify SSH reachability, OS/resource state,
  Docker daemon, disk and memory pressure, firewall exposure, public DNS,
  TLS, and the final public URL from outside the host.
- A change is not complete until dependent services are checked and the
  expected behavior is verified end to end. If a check cannot run, report the
  exact blocker instead of treating the edited service as healthy.

## Admin UI Architecture Rules

- Use `confirmOrderPayment` as the single order-settlement transaction for
  both automatic and manual approvals. Provider adapters may validate or
  claim evidence, but must not duplicate paid-state, stock, wallet, or delivery
  mutations. Keep admin eligibility in `adminOrderPaymentRecoveryAction` and
  actions in `AdminOrderPaymentAction`, including Binance and USDT ledgers.

- Do not place unrelated CRUD forms, provider configuration, ledgers, and
  reconciliation workflows on one large admin page.
- Complex edits must have dedicated routes. Index pages are for summaries,
  status, navigation, search, and safe quick actions only.
- Payment configuration lives under `/admin/payment-settings`; each external
  provider has its own edit page. Payment ledgers and reconciliation live under
  separate `/admin/payments/*` routes.
- Reuse one business policy and one action component across dashboard, list,
  detail, and provider-ledger surfaces. Do not recreate method-specific buttons
  or eligibility conditions inside individual pages.
- POST routes must redirect back to the originating dedicated page with a
  stable notice/error code. Never swallow all domain failures into one generic
  message when the operator needs to distinguish expired, unavailable, and
  provider-verifier states.
- Forms that mutate payment, wallet, product, stock, delivery, or broadcast
  state must show confirmation where destructive/financial, disable while
  submitting, and display a processing state.
- When adding a new provider, create its configuration page, ledger page,
  reusable policy adapter, and navigation entry instead of expanding an
  existing monolithic page.
