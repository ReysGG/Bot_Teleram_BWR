# Storefront UX and delivery release - 2026-09-16

## Features

- Guest product cards retain Tambah. Clerk sign-in modal supports registration,
  with both outcomes forced back to the selected product. A one-hour tab-scoped
  intent retains product/quantity; its exact cart command is persisted before
  dispatch and bound to the signed-in Clerk owner. Uncertain results replay the
  same UUID and revision. Success/definite rejection clears the intent. No payment
  is initiated by login and no anonymous cart is written to the database.
- Orders use server-owned pagination, 10 per page. Search/status cover the full
  owned history. Total/pending metrics cover the account, not just visible rows.
  List reads select summary fields only, excluding encrypted product attachments.
  The old API response remains supported for clients without page parameters.
- Shop sends 12 initial products and loads the next 12 when the sentinel approaches
  the viewport. Ordered public IDs preserve the initial ordering; public batches
  reuse the cached catalog. Failed loads preserve cards and offer retry. Filters
  remount the list and abort previous requests.
- Profile menu fetches the current account balance on opening, updates it in place,
  and links to wallet history. Manage account still opens Clerk, sign-out uses Clerk.
  Owner changes remount and cancel the previous balance request.
- Popular products fill up to 10 items from the catalog. Smooth auto-slide pauses
  on hover, focus, interaction, hidden tabs and reduced motion.
- Cart authentication readiness is distinct from empty state. Page and preview use
  an animated skeleton until the account snapshot is ready; route loading has the
  same placeholder. Existing items remain visible during subsequent refreshes.
- Wallet checkout uses an accessible styled confirmation dialog instead of native
  confirm. The confirmed method/quantity are captured; a synchronous submission
  guard prevents duplicate clicks. Cancellation sends no request. Server wallet,
  stock and payment validation remain authoritative.
- Download gabungan appears for fully allocated multi-file Web orders. UTF-8 TXT
  contents combine with needed line breaks; Codex credentials combine as JSON;
  other formats become a ZIP with safe/deduplicated filenames. Limits: 100 files,
  20 MiB output. Per-file downloads remain available.

## Delivery safety

Single and merged downloads use one order transition lock and shared receipt/stock
finalization. Recipient, paid status, provider status, order item allocation and
stock ownership are checked. All bundle contents are decrypted/rendered before any
receipt update. Receipt and stock updates commit together. Repeated downloads use
the same stock. Completion queues one success announcement, without backfilling old
completed orders. Output is private/no-store and filenames contain no credentials.
No schema migration required. No direct production customer data operations used.

## Validation

942 root tests passed; 64 opt-in tests skipped in the default run. Local disposable
PostgreSQL run: 56 focused tests passed, including ownership, partial mapping,
concurrent delivery, corrupted-file rollback, pagination and one outbox event.
Frontend interaction tests: 16 passed, including StrictMode auth resume, exact retry
payload, account-switch isolation, progressive catalog loading, carousel pause,
no empty-cart flash, wallet modal cancellation and duplicate-submit prevention.
TypeScript/lint checks passed. Backend builds locally and only its image transfers
to Azure; frontend stays on its separate existing VM.

## Live checks completed before the final checkout polish

Guest Chrome showed Tambah and opened both sign-in and sign-up within one popup;
no account was created. Shop grew from 12 to 24 cards on scroll. Owned orders showed
pagination and server-side expired filter. Profile balance displayed; a further
menu refinement removed the need to reopen it to update the amount. The complete
post-auth add path is covered by synthetic tests, not by changing a real user cart.


## Final deployment acceptance

Backend image telegram-app:checkout-polish-20260916 built locally, transferred,
checksum/rootfs verified and promoted on Azure. Active ID:
sha256:9d4fb19cc624fd5c107297d8c903352894d9ea41a9fda53a48ddd71ad42cbb49.
Archive SHA256: ea62557769d2bac107a4ec2e172e5a111831b45f9f938acde0c1a85174890edb.
Private config backup: /opt/telegram-store/backups/checkout-polish-20260916-1789570027.
App/public health and both workers passed; production environment and database
container unchanged. No migration or maintenance toggle.
Frontend release 20260916-144709 is healthy on the existing storefront VM.
Chrome final live review confirmed Download gabungan alongside both per-file
buttons on the owner's paid order, and /cart initially rendered a loading status
then its existing contents without an empty-cart screen. No production download,
checkout submission or customer-data repair was performed for testing.
Wallet and cancellation confirmations use the reusable styled modal; native
window.confirm is no longer used by storefront components. The wallet dialog
and skeleton were visually reviewed with synthetic local fixtures.
