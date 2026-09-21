# Binance receipt and Clerk navbar fix — 18 September 2026

## Findings

### Binance

The signed Pay History API was reachable with Reading enabled, IP restriction
enabled, and trading/withdrawal disabled. A production response contained both
`orderId` and `transactionId` as strings, with different values. The buyer's
submitted receipt matched `orderId`; the verifier previously checked only
`transactionId` and therefore kept polling until the verification window ended.

Read-only evidence for invoice `TGS-20260917-868A38F1`:

- Expected and received: 5.621623 USDT, incoming C2C.
- Recipient matched the configured store account.
- Provider time: 2026-09-17 10:58:50.553 UTC, before the invoice expiry of
  2026-09-17 11:02:16 UTC.
- Invoice remained EXPIRED; payment not marked paid, no stock allocated, no
  products delivered, no refund recorded at audit time.
- Two product units, IDR snapshot total Rp104,000.

Another Binance invoice had no submitted Order ID. It also expired, but that is
a separate case and is not proof of the same matching failure.

No credentials, raw API response, customer identity, or provider receipt IDs are
stored here. The affected expired invoice has not been mutated. The owner was
asked to choose a specifically authorized recovery action.

### Clerk navbar

Reproduced on a guest /shop session: after scrolling to 760px, Clerk applied
inline `body { overflow:hidden }`. This made body the sticky containing scroll
container, moving the navbar to -760px. The header was still in the DOM.

The CSS now locks the root document while a `.cl-modalBackdrop` exists and uses
`overflow:clip` on body, which does not create a new scrolling container. No
header/modal z-index escalation or auth flow change was needed.

## Changes

- Match exact receipt aliases against either provider orderId or transactionId.
- Continue requiring positive exact USDT income, supported type, matching
  receiver, and payment time inside the immutable invoice window.
- Inside an order/receipt-locked transaction, reject another attempt claiming
  either identifier and bind the actual provider transactionId in the existing
  unique canonicalTransactionId field. Original submittedOrderId is preserved.
- Same-invoice retries recognize the original submitted ID after provider binding.
- Unknown/unsafe numeric IDs are not coerced to potentially rounded strings.
- Existing expired/terminal orders stay terminal; no automatic historical repair.
- Navbar scroll locking corrected only while Clerk modal backdrop is present.

No migration or production customer-row edit was needed for the code release.

## Validation and release

- 959 default tests passed; 66 opt-in cases skipped in that run.
- 117 focused tests passed with a disposable PostgreSQL/internal-only network,
  including distinct IDs, concurrent retries, alternative-ID reuse, stock and
  delivery deduplication. Disposable resources removed.
- Root TypeScript/lint and storefront typecheck/lint/build passed.
- Local backend image: telegram-app:binance-receipt-20260918,
  `sha256:f4ae48842d8a23764d9d5c17233fdfbf3d64dec246d3ab020060352c56447fff`.
- Archive SHA256: `b9b87b32838f91f0bfa9f453ce510320470820cb91e939cc9d653556fd1556e2`.
- Azure loaded image: `sha256:903e4faf064251144a9d7c1aff453831fc0729999e792c0eacadb98fc540c0d4`;
  rootfs and runtime config verified against local archive. Azure did not build.
- Private config rollback backup:
  `/opt/telegram-store/backups/binance-receipt-20260918-1789667104`.
- Storefront release: `20260917-174227` (UTC release ID), healthy.
- Actual production Clerk sign-in modal at scrollY=370.4px: headerTop=0,
  body overflow=clip, html overflow=hidden. Synthetic desktop/mobile checks also
  preserved scroll position on close and blocked background scrolling.
- Binance temporarily disabled, then global checkout maintenance enabled for
  deployment. Reconciliation before and after: pending=0, delivery failed=0,
  ambiguous=0, expiry backlog=0. Existing notification failures stayed at 30.
- Both public health checks passed, workers running, PostgreSQL container
  unchanged, runtime environment unchanged. Binance re-enabled and global
  checkout reopened after acceptance.
- No real test payment, force-confirmation, refund, customer message, or credential
  resend was performed. Historical invoice recovery awaits owner instruction.
