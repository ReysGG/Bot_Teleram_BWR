# Admin banned-stock takeout

Deployed on 2026-09-21 WIB; local transactional/download tests and production UI/read-only acceptance passed.

- Entry: inventory row > Kelola > Ambil akun / email banned.
- Review page: `/admin/inventory/[id]/takeout`.
- Authenticated same-origin POST: `/api/admin/inventory/[id]/takeout`.
- Outputs: original account file, email login TXT, or both in ZIP.
- Email is resolved exclusively from the stored K12 account email to the encrypted login vault by keyed email hash. Decrypted identity is checked again. No filename guessing or customer-order fabrication.
- Optional archiving is selected explicitly on the review form with confirmation. It sets DISABLED + archivedAt and removes prior banned-sale approval only after all requested files have been prepared. Missing email aborts the entire request.
- Eligibility excludes reserved/delivered stock, reservation/delivery order IDs, any order item, and any delivery receipt. Status or health must indicate banned.
- Product inventory advisory lock coordinates with checkout; conditional update also protects against state changes. Archived banned stock can be downloaded again after an interrupted transfer. No Telegram delivery, payment, wallet, or customer redemption mutation occurs.
- No schema change. Existing archive/restore workflow remains in use. The archive timestamp is not a new dedicated admin custody audit record.
- Binary response uses private no-store attachment headers; temporary byte buffers are wiped. Sensitive credentials do not appear in page HTML, URLs, or logs.

Validation: full suite passed 996 tests (70 optional DB tests skipped); 17 focused policy/service/route tests passed. Two additional tests passed against isolated PostgreSQL on localhost: archive/retry with encrypted synthetic vault data, and competing inventory allocation winning against admin takeout. Typecheck, lint, and production build passed. Production Chrome acceptance covers navigation and form rendering; no real customer stock is consumed for download verification.

Release must inspect app, DB, scheduler, notification worker, payment workers, storefront and Caddy. This feature runs synchronously in the app; workers require no command or interval change. Do not exercise takeout against real stock as a smoke test.

## Production release

- Active backend image: `telegram-app:stock-takeout-20260920`.
- Image ID: `sha256:8545f353efd7e30e89e258764f7f2eff54cbcd0c54b6a92e256aa7bdcbcb1649`.
- Uploaded archive SHA-256: `1c9ad770fe86403d629280f716c6da67d66b518798a7d8a336f8e5e4704c9da2`; local and remote matched.
- Built locally, loaded on 202.74.74.205, app recreated with `--no-deps`; no migration run. Rollback image remains `telegram-app:manual-sales-20260920` and Compose backup is `/opt/telegram-store/docker-compose.before-stock-takeout-20260921.yml`.
- Checkout maintenance enabled for replacement and reopened after verification. Existing scheduler/notification containers stopped briefly and restarted; both resolve app on the private backend network. App, DB and storefront healthy; Caddy and both workers running. All six environment hashes and database/proxy volumes preserved.
- Authenticated health, fast notification, expiry, stock health, Shopee polling/matching, Binance official/web polling/matching, and USDT worker endpoints returned 200. Stock checker processed nine due production stock records, all healthy with zero errors. No payment was confirmed by the explicit smoke calls; Binance web auto-confirm remains disabled.
- Public API health and storefront shop returned 200; DNS for both names resolves to the VPS; normal TLS validation passed. Telegram webhook target correct, pending updates zero. New takeout route rejects anonymous calls with 401 and malformed authenticated mode with 400, before stock access.
- Chrome verified Banned lifecycle filtering, the new menu entry, and the production takeout page with all three download choices and archive option. No real stock was taken, decrypted for export, or archived as a smoke test. Actual download/archive and concurrency behavior was verified on isolated PostgreSQL with synthetic credentials before release.
- Post-release monitoring: pending notifications 0, failed deliveries 0, ambiguous receipts 0, expiry backlog 0. Existing 30 failed notifications and 121 manual-review notifications predate this release; they are not claimed resolved. Recent app and worker logs contained no error lines in the checked window.
