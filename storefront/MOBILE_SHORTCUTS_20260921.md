# Mobile quick links and Search Console completion

Mobile floating links previously sat 10px above the viewport bottom, beneath the
fixed 68px bottom navigation. At widths <=860px, where that nav exists, quick
links now sit 84px + safe-area inset above the bottom. Auth pages without visible
bottom navigation retain their smaller bottom offset. Desktop placement and
stacking order are unchanged; links continue opening the bot and admin chat.

Chrome local preview and production product page at 390x844 verified nav top
776px, quick-link bottom 760px: 16px gap, no overlap. Both links were visibly
present. The screenshot's lower-left Shopee Partner icon appears to be an
Android app overlay; no such element exists in the storefront implementation.

Deployed `telegram-storefront:mobile-shortcuts-20260921`, config digest
`24eeeeb408aa40c0a5d521b495d7166f995a5cf20724f1cf832cd97c3269fdcb`, OCI manifest
`bfb913afd541bc720bc9b20a1d5a70327057134755d2ca3071cf1dbfc57e8e6c`.
Delta SHA-256 `01578a2a83933951ba71538c175bd494f7ed0429cf64247590f866e859c4ee0b`.
Rollback image `telegram-storefront:ios-download-20260921`, Compose backup
`/opt/storefront/docker-compose.before-mobile-shortcuts-20260921.yml`.

Typecheck, lint, eight build tests and production build passed. Frontend-only
`--no-deps` restart; no migration, secret, backend or worker-command changes.
All six service config/network/mount baselines preserved. App/DB/storefront
healthy; workers/Caddy running. Public health and sitemap endpoints returned
200. Relevant authenticated notification/payment worker checks returned 200,
and the checked recent service logs contained zero error lines.

Search Console: HTML-tag ownership verification completed automatically in
the intended account, sitemap processed successfully with 55 discovered pages,
homepage indexing requested. Actual Google indexing remains pending. See
`SEARCH_CONSOLE_SETUP.md` for the UI evidence and durable setup instructions.

SMS OTP remains awaiting clarification: selling SMSPool numbers/codes on the
website versus SMS OTP as a website login method. Existing bot SMSPool purchase
explicitly requires a private Telegram owner; web purchase must get a properly
authenticated owner adapter and wallet validation rather than bypassing that guard.
