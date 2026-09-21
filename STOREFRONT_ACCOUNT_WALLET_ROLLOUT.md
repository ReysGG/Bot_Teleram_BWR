# Storefront account and refund-wallet rollout

Status: API AND ADDITIVE SCHEMA DEPLOYED on 2026-09-15 after owner authorization
and verified backup. Clerk commerce activation remains pending production Clerk
configuration. Keep both Clerk commerce flags off; see the completed rollout below.

## Implemented boundary

- Clerk signs the session token; the storefront forwards it only server-to-server
  through the existing HMAC-signed API. The backend verifies the signature with
  the configured public key, exact issuer, explicit authorized origin, session
  ID, active status, expiration and a maximum 120-second lifetime.
- Production refuses a Clerk development-instance issuer. Configure the real
  Clerk production instance before any production account binding.
- GET account/wallet does not create a customer. Explicit POST account connects
  the verified Clerk subject to one WebCustomer. New accounts require a verified
  primary email fetched directly through Clerk's Backend API. Phone sign-in may
  still be used, but the account must also have a verified primary email.
- Existing email accounts require their legacy checkout password. Failed attempts
  commit and lock at five failures. Linking is serialized and idempotent; it
  preserves customer ID, orders and wallet ID, disables the old password, and
  revokes legacy sessions. Email changes do not relink, merge or transfer assets.
- Every protected order, QRIS, attachment, download, cancel and payment-reference
  request resolves the current Clerk identity. Signed-out users and switched
  accounts never fall back to a legacy buyer cookie. Legacy access/checkout
  endpoints are closed once backend Clerk commerce is enabled.
- /account exposes order/download and refund-wallet navigation.
- /account/wallet shows balance plus 25 transactions per page. Cursors are
  owner-bound. Operator notes, actor identifiers, private provider data and
  another owner's invoice are not returned.
- Checkout uses the established createDigitalOrder command for WALLET,
  WALLET_QRIS and external methods. There is no second wallet ledger, credit,
  refund or stock allocation implementation. Wallet use requires confirmation;
  customer, amount and balance cannot be supplied as authoritative browser fields.
- Web top-up, cash-out, automatic email delivery and Telegram-wallet merging are
  not implemented. Digital products remain accessible through protected orders.

## Schema files (applied in the 2026-09-15 API rollout)

1. 20260915014500_add_web_storefront_orders is the prerequisite Web channel schema.
2. 20260915120000_add_web_clerk_identity adds nullable clerkIssuer, clerkUserId,
   clerkLinkedAt on WebCustomer, a unique identity index and a complete-pair check.

No migration, DB push, seed, reset, SQL query, or customer binding was run during
this implementation. prisma generate generated local TypeScript files only;
prisma validate checked the schema file only.

## Activation settings

Backend (provision individually; never copy storefront env files):

- STOREFRONT_CLERK_ENABLED=false until validation and rollout are complete
- STOREFRONT_CLERK_ISSUER
- STOREFRONT_CLERK_JWT_KEY (PEM public key)
- STOREFRONT_CLERK_AUTHORIZED_PARTIES (exact storefront origins)
- STOREFRONT_CLERK_SECRET_KEY (server-side Clerk Backend API key)
- Existing STOREFRONT_API_* and STOREFRONT_CONTACT_LOOKUP_SECRET

Storefront:

- STOREFRONT_CLERK_COMMERCE_ENABLED=false until backend rollout is complete
- Its existing Clerk keys and signed Telegram API configuration

No real credentials or environment flags were changed during implementation.

## Validation before production

Code-only tests cover local RSA signatures, invalid issuer/origin/time/session,
account linking and lockout with mocked persistence, wallet ownership/pagination,
legacy session isolation, and routing all payment methods to the existing command.

The opt-in tests/storefront-clerk-db.test.ts is prepared, not executed. Before
activation, obtain authorization for an isolated disposable database and run:

- all migrations on a new disposable PostgreSQL instance;
- concurrent identity creation/linking and unique-index collision tests;
- legacy-session revocation and unchanged wallet ownership/balance;
- the existing Web/Telegram last-stock race, mixed wallet cancellation/expiry,
  insufficient balance, payment-event replay and download ownership suites;
- real Clerk development-account linking and account switching in isolation;
- application builds and container smoke, when the owner authorizes builds.

Mocked tests are not evidence of PostgreSQL concurrency or live Clerk E2E.

## Future production order -- CHECKOUT MUST BE OFF FIRST

1. Obtain explicit authorization for the exact additive migration and necessary
   backup/audit database operations. A request for code does not authorize them.
2. Enable global checkout maintenance and verify new Telegram and Web checkout
   are rejected BEFORE backup, migration, app replacement or recovery.
3. Pause workers according to PROJECT_COMPACT.md; preserve and verify authorized
   backups and rollback images/configuration.
4. Deploy the validated backend/API and apply only reviewed additive migrations.
   Never reset, restore, reseed, remove or recreate the PostgreSQL volume.
5. Configure the production Clerk identity and exact authorized storefront
   origins. Confirm unauthenticated, wrong-account and legacy-cookie requests
   fail closed. Activate matching backend/storefront flags under maintenance.
6. Reconcile workers, audit affected records using authorized operations, and
   verify provider and public health plus new-checkout safety.
7. Only then reopen checkout for the owner's controlled real-payment test.

Rollback must not silently re-enable password access for Clerk-bound accounts.
Preserve bindings and financial data; use a reviewed forward fix or a compatible
image while checkout remains in maintenance.

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

Final cleanup: transferred archives were removed from the VPS and local deploy
folder; only task-labelled disposable PostgreSQL/smoke containers were removed.
Existing local and production databases were preserved. The temporary client
credential staging file was removed. Backups and rollback images remain.
The Caddy authentication-header sentinel leak test returned false. Final root
and storefront lint plus storefront typecheck passed after the login-page and
production-API connection edits.
