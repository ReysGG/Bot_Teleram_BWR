# Google Search Console setup — 2026-09-20

## Property and method

- URL-prefix property: `https://store.buildwithreys.com/`.
- Setup initiated in the user's Chrome Search Console session.
- Verification method: HTML meta tag, configured through the runtime
  `GOOGLE_SITE_VERIFICATION` environment value. Do not delete the tag after
  successful verification.
- The HTML file-download method was blocked by Chrome, so the official
  meta-tag option in Search Console was used instead.
- This does not install Google Analytics or advertising scripts.

## Website preparation

- `/sitemap.xml` dynamically lists only homepage, shop, categories, category
  details and product details from the existing cached public catalog.
- XML is cached for five minutes; no invented last-modified timestamps.
- A disconnected/preview catalog produces a retryable 503 rather than an
  empty or synthetic sitemap.
- `/robots.txt` references the sitemap and disallows private/account/payment
  routes. The matching private routes also send `X-Robots-Tag: noindex, nofollow`.
- Robots rules are crawler instructions, not an access-control mechanism;
  existing authentication remains the protection for customer resources.

## Validation

- TypeScript, lint, production Docker build and eight build tests passed.
- Local image: `telegram-storefront:search-console-20260920`; checksum verified
  before loading on the VPS. Only the storefront app was recreated using
  `--no-deps`; existing environment values preserved.
- Public homepage: HTTP 200, matching Google verification meta tag in HEAD.
- Public sitemap: HTTP 200, valid XML, 52 unique URLs, no private route URLs.
- Public robots: HTTP 200, expected disallow rules and sitemap location.
- Sign-in response has `noindex, nofollow`; both public health endpoints 200.
- Full service set remains running/healthy, workers show no new errors.

## Console completion status

Completed in the owner's Chrome session on 2026-09-21:

- Google displayed `Kepemilikan diverifikasi otomatis`, method `Tag HTML`, for
  `https://store.buildwithreys.com/` under davidboyprogrammer@gmail.com.
- Submitted `sitemap.xml`. Initial table briefly showed `Couldn't fetch`; the
  subsequent sitemap details explicitly showed `Sitemap processed successfully`
  and 55 discovered pages, last read 2026-09-21. Public XML also returned 200,
  55 URLs and zero private/account/order routes.
- Requested indexing for the homepage. Google displayed `Indexing requested`
  and confirmed addition to the priority crawl queue.
- Actual indexing is pending: inspection still reports `Discovered - currently
  not indexed`. Do not equate the request with inclusion in search results.
- Preserve the verification meta tag. No repeated indexing requests are needed
  for the same homepage while Google processes the queue.
