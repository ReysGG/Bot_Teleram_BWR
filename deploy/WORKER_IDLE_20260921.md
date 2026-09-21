# Empty notification poll optimization

The user's earlier one-core CPU spike has not been causally attributed. Five
post-image-optimization samples over approximately 28 seconds showed app CPU
8.67%, 3.52%, 7.11%, 4.14%, 15.94%; no recurrence of the one-core peak.
The final sample also showed storefront CPU 31.10%, demonstrating concurrent
activity rather than proving a cause. Caddy request duration includes network
transfer and cannot be treated as Node CPU time.

Inspection found three fast polling loops, each sleeping two seconds after its
request. Every idle request previously started three claim transactions, each
taking a PostgreSQL advisory lock and searching active chats and pending work.

`processTelegramNotifications` now performs one due-item existence query after
the existing quarantine/recovery steps. If empty, it returns without starting
claim transactions. If work exists, all existing transactional claim slots run.
The probe is not cached, so a new item is seen by the next scheduled poll.
Polling intervals, slot concurrency, batch size, eligibility, deduplication,
lease recovery and payment confirmation are unchanged. No schema migration.

Tests: 1,005 passed, 72 optional DB tests skipped. Focused tests prove no claim
transactions on an empty poll, unchanged slot count when due work exists, and
newly queued work becoming visible on the next poll. Typecheck passed.
Production rollout evidence will be appended once verified.

## Production verification

Deployed on 2026-09-21 as `telegram-app:worker-idle-20260921`. Local image config
digest `3c5a2189aea7439350ddfe427bcffc96099f88fe7f3ff744cd3b5e836aacb33f`;
server OCI manifest digest `68e858bf6c88e409042d77c931340ec8104e55711eb5617e6a4f1c896407ff8d`
references that exact config, and all rootfs layer digests matched. Transfer used
a 26 MB changed-member archive plus the previously checksum-verified image tar;
temporary reassembly/partial-upload files were removed after validation.

App-only `--no-deps` replacement, no migration. Previous image
`telegram-app:admin-performance-20260921` and Compose backup
`/opt/telegram-store/docker-compose.before-worker-idle-20260921.yml` retained.
Maintenance reopened after public/internal health and worker checks.

App, database and storefront healthy; both workers and Caddy running. Six service
environment/command/network/mount baselines matched; workers resolve private app.
Fast notification, general notification/preorder/SMS, expiry, stock health,
Shopee, Binance official/web, matching, and USDT endpoints all returned 200.
The explicit checks confirmed no payment or new product delivery. Idle fast
endpoint returned zero processed/sent/retry/failed/manualReview. Pending outbox,
failed receipts, ambiguous receipts, expiry backlog, and Telegram webhook pending
were all zero. Existing 30 exhausted notifications remain historical issues.

Full suite: 1,005 passed, 72 optional DB tests skipped; lint, typecheck and Docker
production build passed. No CPU percentage reduction is claimed from the code
change without a comparable sustained-load measurement.

Email announcements remain unimplemented pending recipient/provider selection;
Clerk OTP is already active and is independent of this change.
