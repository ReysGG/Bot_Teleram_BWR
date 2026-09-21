# Product search and catalog caching

The existing Next data cache retains public catalog snapshots with 60-second
revalidation. Simultaneous upstream catalog requests now share an in-flight
promise. Private wallet/order/cart/payment reads retain their existing no-store
rules; checkout remains authoritative for current price and stock.

/api/catalog/search-index projects public product fields only, with an HTTP
public/max-age=60 header and the catalog generatedAt marker. Descriptions are
normalized to at most 120 unique keywords per product. Client memory shares one
index across navbar, homepage and catalog inputs for 60 seconds, coalesces concurrent
loads, uses an 8-second timeout and backs off 15 seconds after failure. Index loading
is triggered by focus only. Input changes perform no network requests. Explicit
form submit and selecting a suggestion navigate normally.

Ranking: normalized case/accents/spacing, exact title and title prefix first,
weighted tokens from title/variant, category, tags and description keywords.
All query tokens must match. Words of at least four characters support bounded
optimal-string-alignment (Damerau-Levenshtein variant) distance: one edit, or two
for words of eight or more characters. Queries/words are bounded; autocomplete
returns six candidates. Shop search uses the same ranking and preserves explicit
price/stock ordering controls. Stock status is a tie-breaker and is shown for
unavailable suggestions.

Validation: four targeted tests passed for relevance/typos, shared caching,
concurrent loads, failure backoff and no per-keystroke fetch. Sixteen storefront
regression tests passed; typecheck/lint passed. Chrome local preview verified
chatgtp -> ChatGPT and dropdown presentation. No database, checkout or backend
schema changes required. Frontend deploy uses the existing separate storefront VM.


## Production acceptance

Frontend release 20260916-160654 is healthy. Public index returned HTTP 200 with
Cache-Control: public, max-age=60. Two consecutive reads returned the same catalog
generatedAt marker (44 entries, 24,637 uncompressed response bytes at verification).
Chrome production review: chatgtp produced six relevant suggestions; submitting
it returned 29 catalog matches. At a 390px viewport the popup bounds were x=58.8
through x=385.2 (no horizontal overflow). Viewport reset after review. No product,
cart, wallet or order mutation was performed for this change.
