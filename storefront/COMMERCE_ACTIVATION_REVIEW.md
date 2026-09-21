# Prepared production commerce activation — 2026-09-15

**Completed after explicit owner approval.** This file preserves the preflight
review. Current runtime state, backup evidence and limitations are documented in
`COMMERCE_ACTIVATION_RESULT.md`.

## Completed preparation

- Primary domain and trusted HTTPS: https://store.buildwithreys.com.
- Clerk production instance created through the official authenticated Platform API:
  `ins_3JMyNwMs9QBbWKzMdrgtr5tSqsd` in application
  `app_3JLkORzgGrGJAitRHvP3wrCFqhu`.
- Production uses verified email and password; phone/SMS features are off. No paid
  upgrade or development-user migration was performed.
- Clerk paths: `/`, `/sign-in`, `/sign-up`, sign-out to `/`.
- Production keys pulled into ignored private staging; public signing key
  retrieved and separate backend configuration prepared. No real key is in this file.
- 48 migrations applied to a fresh disposable PostgreSQL database.
- Full tests: 898 passed, 59 skipped. TypeScript and ESLint passed.
- Focused identity/cart tests: 47 passed, including real PostgreSQL transactions.
- Additional web order, stock race, wallet, cancellation and payment-contention
  database tests: 12 passed. Initial missing QRIS fixture was corrected only in
  disposable test environment using synthetic QRIS data; production was untouched.
- Backend runner and migrator built on the Freestyle VPS. Runtime smoke on
  separate disposable containers passed: health 200, unsigned 401, signed catalog
  200, replay 409, cart without identity 401. Test containers were removed.
- Frontend candidate built with production publishable key; /shop, /sign-in,
  /sign-up and /cart returned 200 on loopback candidate port 3004.

## Candidate artifacts

- Backend: `telegram-app:clerk-candidate-20260915`.
- Migrator: `telegram-migrate:clerk-candidate-20260915`.
- Frontend: `telegram-storefront:clerk-candidate-20260915`.
- Frontend image: `sha256:02efeb6a327d0df05ca19db30581c3e479639c3ed349a0cb5c5f00712b5661cc`.
- Backend archive: `/home/azureuser/storefront-activation-20260915/images.tar.gz`.
- Archive bytes: 179654516.
- Archive SHA256: `cccd49f0d8abddcd54019eab76f61b9e880e0572c87b5ebd16ce7eb314e8a9cb`.
- Freestyle build records are under
  `/opt/telegram-storefront-freestyle/commerce-build-20260915/` and
  `/opt/telegram-storefront-freestyle/clerk-frontend-build-state.json`.
- Private runtime staging uses mode-700 parent directories on each VPS.
- Existing Azure app remains `telegram-app:production`, image
  `sha256:fb2cfa42f6f33baab2770638e1c54bacad4a0c4f6f2102eee1cfbb271a46634c`.

## DNS records awaiting browser-action approval

The owner has authorized Freestyle DNS records previously. These five additional
records grant Clerk its production authentication/email domain and are separate:

| Relative CNAME name | Destination |
| --- | --- |
| clerk.store | frontend-api.clerk.services |
| accounts.store | accounts.clerk.services |
| clkmail.store | mail.3i8zwmvsp97u.clerk.services |
| clk._domainkey.store | dkim1.3i8zwmvsp97u.clerk.services |
| clk2._domainkey.store | dkim2.3i8zwmvsp97u.clerk.services |

Use TTL 300. The first record is filled in the DomaiNesia form but not saved.
Do not infer approval from elapsed time or the preselected answer.

## Exact production database/deployment operation for approval

1. Enable global checkout maintenance through the authenticated admin endpoint;
   this temporarily pauses new bot checkouts as well as website checkouts.
2. Save private environment/Compose backups and dated rollback image tags. Read
   migration metadata to confirm only `20260915173000_add_web_cart` is pending.
3. Pause scheduler and notification worker for the short rollout window. Create
   a full PostgreSQL custom-format `pg_dump` in `/opt/telegram-store/backups/`;
   validate the dump with pg_restore --list and record its size and SHA256.
4. Apply only the reviewed additive migration using the candidate migrator and
   `prisma migrate deploy`. It creates WebCart, WebCartItem, WebCartMutation and
   their indexes/foreign keys. It does not update/delete existing customer,
   order, wallet, product or stock rows. Reject unexpected pending migrations.
5. Configure only STOREFRONT_CLERK_ENABLED, STOREFRONT_CLERK_ISSUER,
   STOREFRONT_CLERK_JWT_KEY, STOREFRONT_CLERK_AUTHORIZED_PARTIES and
   STOREFRONT_CLERK_SECRET_KEY on the backend. Activate the candidate app.
   Do not recreate the PostgreSQL container or its named volume.
6. Configure the frontend's production Clerk keys and enable Clerk commerce,
   keeping preview writes locked during verification. Replace only its app.
7. Verify Clerk DNS/SSL/email readiness, backend/frontend health, service HMAC,
   rejected unauthenticated/wrong-identity access and worker recovery. Preserve
   Clerk bindings in any rollback; never re-enable legacy access for bound users.
8. Reopen checkout only after those checks pass. Do not simulate a paid order
   or perform a real payment on behalf of the owner. The owner can then perform
   their controlled purchase test.

No production database query, backup, migration, customer binding, invoice,
payment or data edit has been performed during this preparation. Domain and
frontend UI deployments described in earlier records are already live.
