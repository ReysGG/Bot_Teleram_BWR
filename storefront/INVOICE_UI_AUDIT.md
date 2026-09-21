# Invoice UI/UX audit — 17 September 2026

## Scope and release status

Deployed to storefront production on 17 September 2026, release
`20260917-003515`. Covers the authenticated
invoice detail, payment instructions, product downloads, paired-login retrieval,
guidance, and invoice loading state. No backend, database, wallet accounting,
stock allocation, or Telegram worker changes.

## Design consultation and assets

ChatGPT browser conversation:
https://chatgpt.com/c/6aaadb3b-ab88-83ec-8fab-2736ceda6617

Local file uploads were blocked by Chrome extension file-URL permissions.
Public visual-reference URLs were supplied instead. ChatGPT reported viewing
`why/why-character.webp`, `empty-states/product-not-found.png`, and
`headings/orders-heading.png`; `headings/cart-heading.webp` timed out.
Only public references and a textual description of the UI problems were sent.
No customer invoice screenshots, credentials, or product contents were uploaded.

Two completed images were retrieved from the ChatGPT browser, visually inspected,
and encoded as transparent 640×480 WebP assets:

- `public/illustrations/invoice-success.webp` — 43,246 bytes.
- `public/illustrations/invoice-pending.webp` — 43,414 bytes.

Both use the existing blue-hoodie character style. They are decorative and compact
on desktop, hidden on small screens where status icons preserve space for actions.

## Implemented decisions

- Product title reduced to 22–34px responsive scale; invoice appears once in the
  main heading, with a copy action and accessible feedback.
- State-specific status/next-action banner replaces the oversized title and
  duplicated paid panel.
- Desktop primary content plus compact transaction summary. Mobile prioritizes
  payment/download/login, followed by summary, product guidance, and support.
- QRIS expiry and refresh action sit with payment instructions. Closed invoices
  do not show stale QR codes or download controls.
- Paid waiting-stock orders explicitly say files are not ready. No paid-ready
  promise is inferred from the payment flag alone.
- Previously retrieved files remain available with `Download ulang`. Combined
  download eligibility and backend ownership enforcement remain intact.
- Login retrieval is compact, includes partial availability/help, and explains
  the website flow separately from seller-authored Telegram `/start` guidance.
  Original seller guidance is preserved.
- Refresh failures produce a visible error. No silent rejected request.
- Route-level invoice skeleton uses Next loading/Suspense and respects reduced
  motion. No extra polling or catalog/payment query loops were introduced.

## Local preview

Start from repository root:

```powershell
node node_modules/vite/bin/vite.js --config storefront/qa/dev/vite.config.ts
```

Open `http://127.0.0.1:4175/orders/DEMO-INVOICE-001`.
The status links switch between delivered, ready, pending, waiting, expired,
refunded, and cancelled. The QRIS fixture is deliberately a labelled placeholder,
not a payable QR. Login-download fixtures contain no real credentials.

## Validation

- `npm run typecheck` — passed.
- `npm run lint` in storefront — passed.
- `npm run build` in storefront — passed after the UI/asset changes.
- `npx --no-install vitest run --config storefront/qa/storefront-flow.config.ts`
  — 19 passed, including paid-waiting-stock truthfulness, closed-state precedence,
  and removal of obsolete payment deadlines on delivered orders.
- Chrome visual checks: desktop, 390px mobile, download layout, expanded login
  help, QRIS-first layout; all seven mobile fixtures have no horizontal overflow.
- Real product downloads and payment creation were not used for visual QA.

## Limits

This is a frontend presentation change. It does not independently re-audit
production payment accounting, delivery encryption, database reconciliation, or
stock concurrency. Existing server authorization and transaction rules remain
the source of truth. Production presentation acceptance passed on an existing completed invoice; no
new payments or real credential downloads were performed.

## Production deployment acceptance

- Existing deployment template, unchanged VM/environment, healthy release
  `20260917-003515` on `https://store.buildwithreys.com`.
- Candidate build/typecheck/lint/frontend tests completed; deployment status healthy.
- Public `/api/health`: HTTP 200.
- Both new illustration URLs: HTTP 200; downloaded bytes match local SHA-256.
- Signed-in Chrome invoice: new status illustration, compact summary, Download
  ulang, and paired-login card present; old payment deadline absent on completed
  invoice.
- Production mobile 390px: no horizontal overflow, 44px-high download button,
  summary below product access. Browser viewport restored after verification.
- No database operations, backend release, or Telegram changes.
