# Admin navigation and public product image optimization

## Measured baseline

On 2026-09-21 the 2-core VPS had 3,911 MiB RAM, approximately 2,067 MiB available,
12 MiB swap used, and 27/58 GiB root disk usage (46%). Docker reported 15.04 GB
of images and 12.45 GB of build cache; these share layers and are not additive.
No cleanup or volume deletion was performed. One sampled app CPU spike exceeded
one core; it later fell to 4.63%. No OOM/restart or recent heap/Prisma error was found.

Internal authenticated HTTP full-body timings: products 551/331/279 ms,
banned inventory 129 ms, orders 784 ms. These do not include the user's network
or browser rendering and are not a claimed end-to-end navigation SLA.

Public card images were sent unoptimized. Four PNGs were 1.52-1.99 MB and took
47-68 seconds from the workstation, while two JPEGs were 8-9 KB and took
193/704 ms. All six decoded correctly. Representative resize results were
1,572,375 -> 72,542 bytes and 1,521,756 -> 79,854 bytes (about 95% smaller).

## Changes

- Sidebar links warm the destination only after 120 ms pointer intent, keyboard
  focus, or touch. Automatic prefetch of all sidebar routes stays disabled.
- Product summaries run concurrently with the paginated ledger. Product status
  counts are obtained in one grouped query instead of two counts. No product or
  payment data is cached by this change.
- Public stored product/group images over 32 KB are converted to WebP quality
  78 within 1280x1280 only if the output is smaller. Animated uploads remain
  original; decoder errors fall back to the accepted original upload.
- Image transformations use a 16-megapixel decode limit, serialized work,
  identical-image request coalescing, and an in-memory 16 MiB / 64-entry cache.
  Cached entries contain public image bytes only. Original database files are
  unchanged. Versioned image URLs rotate to invalidate old browser image caches.
- No schema migration, worker interval change, or authentication change.

## Validation

Full suite: 1001 passed, one old structural assertion required adapting to the
new intent-only link policy; 72 optional database tests skipped. Focused image
and navigation tests then passed (7 tests). Lint passed. Build/deployment and
post-release timings are recorded below when complete.

Email announcements remain pending the user's recipient/provider choice. Clerk
continues handling OTP; this performance release does not add email delivery.

## Production release and acceptance

- Deployed `telegram-app:admin-performance-20260921`, image ID
  `sha256:3e1160807c7ef02d0c1e619a914260890bddbc6ff65592eac5d10631734cfb27`.
- Local/remote archive SHA-256 matched:
  `e022a9dd1dba7a8fed68a8e108cacd0696709fdc3f7e69076f4ea77b84770920`.
- Docker production build and typecheck passed. App-only `--no-deps` rollout;
  no migration. Previous image `telegram-app:stock-takeout-20260920` retained;
  Compose backup `/opt/telegram-store/docker-compose.before-admin-performance-20260921.yml`.
- Checkout maintenance enabled during replacement and reopened after checks.
  All six relevant service environment/command/network/mount configurations
  matched their baseline. App, PostgreSQL, storefront healthy; scheduler,
  notification worker and Caddy running. Both workers still resolve private app.
- Authenticated notification, expiry, stock-health, Shopee poll/match, Binance
  official/web poll/match, USDT endpoints all returned 200. Zero explicit smoke
  payment confirmations. Telegram webhook pending count zero. Recent app and
  worker logs contained no error lines in the checked two-minute window.
- Production image responses are WebP, 72,542 and 79,854 bytes. External Windows
  HTTP samples took 1,437 and 9,509 ms; network latency remains variable and no
  universal navigation/load-time guarantee is claimed. Chrome showed both
  formerly partial first-row images fully rendered, as well as second-row art.
- Chrome Products admin rendered normally. Internal HTTP full-body samples:
  products 341/246 ms and orders 579 ms. These are not browser timings or a
  statistically controlled comparison with the earlier baseline.
- Pending notifications, failed deliveries, ambiguous receipts, expiry backlog
  all zero. Existing 30 failed notifications remain; not retried by this release.
