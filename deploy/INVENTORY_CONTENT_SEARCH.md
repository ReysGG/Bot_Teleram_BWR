# Inventory content lookup

Admin route: `/admin/inventory/search`.
Navigation: **Cari isi stok & pembeli**, plus a link from inventory filters.

The operator enters 4–256 characters and optionally chooses a product. The
search checks literal text without case sensitivity across all inventory
lifecycle states, including delivered and archived stock. Results contain file
metadata and the associated order buyer, email, Telegram identity, and invoice
link. Credential contents and snippets are not included in results.

## Privacy and load bounds

- The authenticated same-origin POST endpoint receives the query in its body;
  no query appears in navigation URLs. Responses use `private, no-store`.
- No schema migration or plaintext search index is required. Existing encrypted
  stock is decoded only in the server process; decrypted buffers are cleared.
- Requests read 100 stock items plus one lookahead, in stable ID order. The
  browser submits sequential batches, spaced by 600 ms, after explicit submit.
- A search run pauses after 5,000 examined items or at least 100 new matches;
  the operator can continue from the cursor. Partial results are labelled.
- Stop/unmount aborts the browser request. At most the current bounded batch
  can finish on the server. The endpoint allows 120 requests/minute per admin
  per app process; this is not a distributed global limit.
- Decryption failures and non-UTF-8 files are counted separately. Binary
  archives/documents are not parsed. A missing key does not silently count as
  a complete search with no matches.
- This is a scan, not an indexed lookup; restrict by product for large
  inventories. No stock, order, wallet, payment, or delivery state is changed.

## Verification

Regression tests cover legacy/v2 encrypted stock, partial case-insensitive
matching, buyer mapping, absence of credential data in results, pagination,
corrupt/binary files, authentication, origin checks, body size and rate limits.
Production deployment is separate from local implementation validation.
