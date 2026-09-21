# Telegram checkout UX — 17 September 2026

## Changes deployed to production

- Telegram buyers can hold up to five pending invoices. Web checkout retains its
  existing single-active-invoice policy. A buyer advisory lock precedes inventory
  locks so simultaneous checkouts for different products cannot exceed the cap.
- Expired invoices under Binance/BEP20 verification remain counted for their
  existing verification window. Existing idempotency keys still replay before
  the new-invoice cap is applied. No existing invoice is cancelled implicitly.
- My orders prioritizes up to five pending invoices, followed by recent orders
  without duplicates. Limit errors link to all orders and the catalog.
- Invoice messages are protected from ordinary catalog/navigation edits and
  cleanup. Provider invoice renderers may update only their own invoice, and
  never a bubble containing an acknowledged delivery receipt.
- Single-file or complete single-bundle delivery replaces the uniquely owned
  invoice using Telegram multipart `editMessageMedia`. The normal completion
  worker updates that same document's caption and controls.
- Ready-order payment-success notifications no longer create another success
  bubble or delete the invoice before delivery.
- Historical shared message IDs and messages containing another order's file
  cannot be replaced. Missing/uneditable invoice fallback is permitted only on
  an explicit Telegram rejection. Unknown upload outcomes never trigger a
  second send and retain the existing manual-review protection.
- Large orders needing multiple delivery chunks retain separate files. Existing
  preorder notifications and legacy orders without a usable invoice may also
  require a new delivery message. Historical files are never resent by a rollout.

Telegram reference: https://core.telegram.org/bots/api#editmessagemedia

## Search dropdown

The home hero now has its own z-index 6 stacking context, above carousel artwork
and arrows (2–4), below the sticky header (50). On narrow screens the dropdown
anchors to the full search form, preventing clipping at the viewport's right edge.
Preview: http://127.0.0.1:4175/search-layer-preview

## Binance activation checkpoint

- Owner approved creating `BWR Tele Payment Verifier`, HMAC, reading only, scoped
  to the Azure server IP. User completed Authenticator/email/facial verification.
- Key created; permission API verified reading=true and trading, withdrawals,
  internal transfer and universal transfer=false.
- Signed Pay History GET from Azure succeeded. No payment or transfer was made.
- The Binance UI's IP Save action did not persist; API inspection still reported
  ipRestrict=false. User was asked to finish Save directly. Do not claim the IP
  restriction is active until a subsequent permission check proves it.
- Credentials are in an ignored, ACL-restricted local private environment file
  and a 0700 staging directory on Azure. They are not in source/build contexts.
  Production runtime configuration and customer-facing enable switch remain
  unchanged at this checkpoint. Never print credential values.

## Validation

- Default root suite: 956 passed, 65 opt-in cases skipped.
- Disposable PostgreSQL/internal-only Docker network: 78 focused cases passed,
  including parallel multi-invoice creation/payment, unique stock assignment,
  cancellation ownership, bundle safety, and invoice-message protection.
- Database and network created for testing were removed by the test helper.
- Backend image built locally using `deploy/build-multi-invoice-local.py`, with
  tag `telegram-app:multi-invoice-20260917`; Azure must only load/run the image.
- No migrations, production database operations, customer payment creation, or
  real credential delivery were used in this work.

Root TypeScript and lint passed. Storefront typecheck, lint, and production
build passed after the mobile dropdown correction. Production deployment has
not occurred here.

Local backend image: `sha256:338b1a2aabcb6f90b843cdfd06ec7969283a1cb3cef1aa775230b3d9ca70c30a`.
Prepared archive: `deploy/multi-invoice-image-20260917.tar.gz` (133151476 bytes),
SHA-256 `266059b9784af65e581da09945e1d406909766498ac8bfd01856281730f3b2a1`.
Metadata is in `deploy/multi-invoice-image-manifest.json`. Production code/image
and database remain unchanged pending rollout.

## Production acceptance ? 17 September 2026

The checkpoint above is historical; the owner subsequently completed Binance
IP Save. A signed permission check from Azure verified ipRestrict=true,
enableReading=true, and trading/withdrawal/internal/universal transfer=false.
Pay History remained accessible. The visible Binance dashboard UID matched the
configured recipient before activation; identifiers and credentials are omitted.

- Backend image loaded and content verified against the local archive:
  `sha256:2d5dc39c1cdc07601f133cdc4bc486b2e80bf012f2de180f78d117d6f08a9e23`.
- Local/Azure image IDs differ by archive format; rootfs layers and runtime
  configuration matched exactly. No build ran on Azure.
- Private config/image rollback backup:
  `/opt/telegram-store/backups/multi-invoice-20260917-1789637359`.
- Only BINANCE_API_KEY, BINANCE_API_SECRET, BINANCE_API_BASE_URL changed in the
  runtime env. API key/secret values are absent from source, docs, and build.
- Binance Pay enabled via the authenticated central payment-settings form;
  exactly one method changed. API read-only verifier ready and success notice
  confirmed the setting. Web-session gates remain unchanged.
- Frontend release `20260917-092647` healthy. Production Chrome hit testing
  confirmed the dropdown above overlapping carousel images; mobile bounds
  16.8?358.4px stayed inside the 375px document width.
- App healthy, both workers running, production PostgreSQL container unchanged,
  both public health endpoints healthy. No migration, customer data recovery,
  actual purchase/payment, or historical credential resend performed.
- Buyer real-payment acceptance remains an owner-operated test. Automated and
  disposable-DB test results do not claim a live Binance payment was completed.
