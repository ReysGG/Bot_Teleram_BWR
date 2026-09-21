# Production commerce activation completed — 2026-09-15

Primary URL: https://store.buildwithreys.com

The owner explicitly approved the five Clerk DNS records, verified database
backup, additive cart migration, backend/frontend activation and reopening after
checks. This supersedes earlier notes that commerce is disabled.

## Active configuration

- Clerk production instance: `ins_3JMyNwMs9QBbWKzMdrgtr5tSqsd`.
- Clerk reports DNS, SSL and mail complete, with no pending DNS records.
- Login uses verified email/password. Phone/SMS is off; no paid upgrade occurred.
- Backend `STOREFRONT_CLERK_ENABLED=true`.
- Frontend `STOREFRONT_CLERK_COMMERCE_ENABLED=true`.
- Frontend `STOREFRONT_PREVIEW_READ_ONLY=false`; preview banner is absent.
- `STOREFRONT_PREVIEW_MODE=false`; catalog still comes from the signed backend API.
- Global checkout maintenance is off; normal bot checkout has resumed.

## Backend deployment and backup

- App image: `sha256:a2497c552e9869164564b658065d04dcce9a0649daaeb623fc5edf34890f1311`.
- Migrator image: `sha256:42efc93a031dbf28eee72696b8e8199b8dab58a41e6a5b9b17144e72e5ab42bf`.
- Only newly applied migration: `20260915173000_add_web_cart`.
- All 48 migration names match the validated manifest. WebCart, WebCartItem and
  WebCartMutation exist. No reset, restore, seed or existing-user SQL edit occurred.
- PostgreSQL container ID remains
  `359356a8f9adac28a5cc64218444ff46ca20f30804e6ea8b62b7af7c80abe4be`;
  mounts were compared before/after and remained identical.
- Backup directory: `/opt/telegram-store/backups/clerk-cart-20260915T155646Z`.
- Database dump: `database.dump`, 54,655,422 bytes. pg_restore --list passed.
- Dump SHA256: `6143ab3d223b9cd0bd885121728de9a3d6256efb57715cc6c58d682bf128ff6d`.
- Private environment and Compose backups are in that same directory.
- Rollback tags: `telegram-app:rollback-clerk-cart-20260915T155646Z` and
  `telegram-migrate:rollback-clerk-cart-20260915T155646Z`.
- Final state record: `/home/azureuser/storefront-activation-20260915/rollout-state.json`.

## Frontend deployment

- Image: `sha256:02efeb6a327d0df05ca19db30581c3e479639c3ed349a0cb5c5f00712b5661cc`.
- Production-key image built and smoke-tested on Freestyle before replacement.
- Auth-stage backup: `/opt/telegram-storefront-freestyle/backups/clerk-stage-20260915T155909Z`.
- Checkout-open backup: `/opt/telegram-storefront-freestyle/backups/clerk-open-20260915T160501Z`.
- Rollback tags mirror those timestamps with prefix `telegram-storefront:rollback-clerk-`.
- State record: `/opt/telegram-storefront-freestyle/clerk-activation-state.json`.

## Evidence and practical limits

- Before deployment: 898 default tests passed, 59 skipped; 47 focused Clerk/cart
  tests passed; 12 real disposable PostgreSQL payment/wallet/order tests passed.
- Backend and frontend builds, TypeScript and lint passed. Backend candidate ran
  on an independent disposable database with all 48 migrations.
- Live backend: health 200, unsigned catalog 401, signed catalog 200, replay 409,
  cart without identity 401, invalid Clerk identity 401.
- Live frontend: /api/health, /shop, /sign-in, /sign-up, /cart, /orders return 200
  with no preview banner. Anonymous account/cart/checkout POSTs return 401
  `sign_in_required`, proving the preview lock is removed while authentication remains.
- Clerk login form loaded in Chrome without Development mode or phone entry.
- Scheduler and notification worker are running. Reconciliation returned expired
  orders/top-ups 0; notifications processed/sent/retry/failed/manualReview all 0.
  Telegram webhook pending updates: 0.
- Active external methods in the backend catalog: QRIS, Bank Jago, USDT BEP20.
- No real payment, production test invoice, or manual customer binding was made.
  The owner can perform a controlled purchase test after registering/signing in,
  verifying email and connecting the Web commerce account once.
- Development users are not automatically production users. Existing Telegram
  wallets remain separate. Web product delivery is through authenticated orders;
  automatic email product delivery and Web wallet top-up are not implemented.
- WhatsApp Desktop self-chat David Boy (You) received the activation update and
  current URL; sent message was verified with two check marks.
- Temporary local/backend credential staging copies and the frontend candidate
  container were removed after activation. Runtime secrets remain in the active
  private environment and the retained private rollback backups.

## Recovery

Enable frontend read-only and global maintenance before any recovery. Preserve
Clerk identity bindings and existing financial data. Do not restore old environment
flags in a way that re-enables legacy access for bound accounts. Prefer a compatible
image/forward fix; retained database dumps are backups, not an instruction to restore.
