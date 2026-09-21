# Footer community links — 2026-09-20

## Theme refinement requested after the first release

The user preferred a compact column layout inspired by a reference, while
explicitly retaining BWR Tele's own theme rather than copying that design.
The revised footer replaces the large contact cards with Belanja, Akunmu and
Temui kami link columns, plus a brand/community area and social icons. It uses
navy text, a light blue background and the site's blue accent. No newsletter
form, unrelated legal links or third-party brand content were introduced.
Mobile uses two compact link columns, a dedicated contact section and the
community call to action. External targets and runtime group override are
preserved. New image: telegram-storefront:footer-columns-20260920.

## Original community-links release

The shared footer now has four external contact cards: Telegram admin
(@davidboysaja), the existing bot's Sharing Session community, Telegram bot
(@K12JsonStockBot, using the existing public bot setting), and Threads
(@buildwithreys_ai). The community target can be overridden at runtime with
STOREFRONT_TELEGRAM_GROUP_URL. The default matches the current bot community
configuration; it is not the transaction announcement channel.

The footer has independent CSS, four desktop columns, two tablet columns,
and one mobile column. It is now visible on mobile with clearance for fixed
navigation. Cards include keyboard focus, hover feedback, reduced-motion
support and external links with noopener/noreferrer.

TypeScript, ESLint, the four build filter tests and 19 storefront interaction
tests passed. The image was built locally, transferred and checksum verified,
then only storefront app was recreated with --no-deps. Active image:
telegram-storefront:footer-community-20260920.

Chrome verified the footer at desktop and 390px viewport and inspected all
four rendered href targets. Backend, database and worker services were not
modified; public health and complete container/worker state were checked.

The theme refinement was deployed and verified in Chrome at desktop and 390px. All four external destinations remained correct. Both public health endpoints returned 200 and the complete service set remained running/healthy. TypeScript, lint, production build, four filter tests and 19 UI regression tests passed.

