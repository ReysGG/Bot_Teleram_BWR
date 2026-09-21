# Telegram Storefront

This folder is a separate web storefront for the independent Telegram store.

## Boundaries

- Never deploy this storefront, its Caddy container, or its public traffic on
  the current Telegram VPS at 70.153.137.10.
- Never import the parent Telegram app's Prisma client or database tables.
- Never mount or copy the parent app's environment files, cookies, bot tokens,
  payment credentials, or encryption keys.
- The storefront may connect to the Telegram store only through its future
  authenticated HTTPS service API.
- The Telegram backend remains the owner of catalog truth, checkout, payment,
  stock reservation, wallet, fulfillment, and Telegram delivery.
- Cache public catalog presentation on the storefront VPS. Do not turn page
  views into repeated Telegram-backend database queries.
- Keep TELEGRAM_STORE_API_BASE_URL and TELEGRAM_STORE_API_SHARED_SECRET in
  deployment secrets only.

## Local validation

Run npm.cmd run typecheck, npm.cmd run lint, and npm.cmd run build from this
folder. Use a disposable container for smoke tests.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
