# iPhone private product downloads

## Problem and scope

The prior download control fetched the entire file, created a temporary blob URL,
clicked an anchor programmatically and revoked the URL after 30 seconds. This
provided no persistent user-tapped fallback when Safari or an embedded browser
did not save the file. Server SENT status means the bytes were supplied; it cannot
prove that iOS saved them to the Files app. The exact customer's device behavior
has not been reproduced on a physical iPhone.

## Change

- Shared `PrivateFileDownload` for individual deliveries, ZIP bundles and the
  POST-only login-email export. Existing authorization/API routes remain intact.
- iPhone/iPad (including desktop-mode iPad) prepares the file first. A fresh
  user tap then invokes native file sharing, preserving user activation across
  slow network requests. No share or external transmission runs automatically.
- Visible blob download and authenticated same-origin GET browser-download
  fallback. POST-only login exports do not expose a misleading GET fallback.
- TXT/JSON up to 1 MiB can be read in a read-only textarea after explicit file
  preparation. HTML is not rendered; no credential is persisted to browser
  storage, URLs, logs or preloaded page markup.
- Object URLs remain valid while the component is mounted, are revoked on
  replacement/unmount, and pending fetches are aborted on unmount. Cancelling
  sharing preserves the prepared file for retry without another fetch.
- iOS copy explains Save to Files / iCloud Drive / On My iPhone. TXT/JSON/ZIP
  files do not belong in the Photos gallery. Status copy avoids claiming the
  product is definitely saved on the device. Existing re-download stays usable.
- No backend settlement, delivery allocation, schema, Clerk or worker changes.

## Validation

Seven focused tests passed: two-step sharing with one fetch, cancellation,
unsupported share fallback, POST-only export, blob lifetime, unauthorized access,
iPad desktop detection and filename handling. Nineteen storefront flow tests
passed; eight existing Node tests, typecheck, lint and production Docker build
passed. Chrome local preview with synthetic data verified download preparation,
visible controls and readable TXT content. Native iPhone Save to Files still
requires device acceptance; desktop Chrome or mocked iPhone UA is not equivalent.

## Production release

Deployed `telegram-storefront:ios-download-20260921` on 2026-09-21. Image config
digest `05c546297fa85e49443b422030ae64f933927ae892e67395930a69b6fab11c2b`;
verified server OCI manifest `14c753d454aeb772810919f5d0783647306c9f64e98cfc6c127dc5ab575cc4d0`.
Transfer delta SHA-256 `4a7ea03cce499602eb1859860d17fb50e7a63949164061063ea2685d36a8dc60`.
App-only storefront replacement with `--no-deps`, no migration/backend change.
Rollback image `telegram-storefront:search-console-20260920`; Compose backup
`/opt/storefront/docker-compose.before-ios-download-20260921.yml`.

Public storefront health/shop 200; anonymous delivery endpoint 401. Backend,
storefront, database healthy; workers and Caddy running; all six service
environment/command/network/mount baselines unchanged. Notification, expiry,
Shopee, Binance official/web and USDT worker endpoints 200. Recent app,
storefront and worker logs had zero error lines in the checked window.
Checkout reopened after monitoring checks. Original files and access checks are
unchanged; no real customer file was downloaded as a smoke test. Physical iPhone
acceptance is still outstanding and must not be described as verified.
