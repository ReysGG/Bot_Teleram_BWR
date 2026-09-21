# New server bootstrap — 18 September 2026

## Target

- Host: `202.74.74.205`, SSH user `BwrTele`.
- Ubuntu 22.04.5 LTS, amd64, 2 CPUs, 3911 MiB RAM, 58 GiB root disk.
- SSH authentication verified using a private local key; no password required.

## Installed configuration

- Docker Engine from the official Ubuntu apt repository and Compose plugin.
- Docker enabled at boot; local log driver, 10 MiB per file, 3 files.
- 2 GiB `/swapfile`, persistent in `/etc/fstab`; swappiness 10.
- UFW enabled: SSH, TCP 80 and TCP 443 allowed; other inbound denied.
- Root-owned deployment directories: `/opt/telegram-store`, `/opt/storefront`, `/opt/store-proxy`.
- Do not publish PostgreSQL or app container ports on public interfaces. Docker published ports can bypass UFW.
- Build application images locally; transfer built Linux amd64 artifacts to the server.

## Staged backup

- Snapshot created at 2026-09-18 05:23:25 UTC (12:23:25 WIB).
- Local: `backups/production/20260918T051154Z/database.dump`.
- New server: `/opt/telegram-store/backups/20260918T052325Z/database.dump`.
- Size: 59,907,839 bytes.
- SHA-256: `757067cbd10f7f43d85eb5da79ddebb1e0408b5130c81e51b6ba9e2911350489`.
- Backup directory private, file mode 600; source and destination checksums match.

## Cutover boundary

Bootstrap does not switch DNS, Telegram webhook, bridge routing, or start financial workers.
Restore of the production snapshot into the new PostgreSQL database requires explicit authorization under AGENTS.md.
Keep the original encryption keys for restored encrypted stock and provider sessions.
Before cutover, reconcile writes after this snapshot and ensure only one worker deployment can deliver or confirm payments.
Do not resume checkout until payment health and outstanding incident checks pass.

## Completed cutover

- `store.buildwithreys.com` now points to `202.74.74.205` and serves the storefront through Caddy.
- `api.buildwithreys.com` now points to `202.74.74.205` and serves the Telegram app and admin dashboard.
- Telegram webhook: `https://api.buildwithreys.com/api/telegram/webhook`.
- Telegram app, PostgreSQL, scheduler, notification worker, storefront, and Caddy are healthy.
- Scheduler configuration includes notifications, stock health, expiry, monitoring, reengagement, Binance internal, Binance web and matcher, USDT BEP20, Shopee polling, and Shopee matching loops.
- The latest Telegram image is `telegram-app:binance-receipt-20260918`; storefront remains `telegram-storefront:category-check`.
- Storefront is attached to the internal `telegram-store_edge` Docker network; its application port is not publicly exposed.
- Final URL checks returned HTTP 200 for storefront health, API health, and the admin login page.
- The old VPS remains available for rollback until live user checks finish.
