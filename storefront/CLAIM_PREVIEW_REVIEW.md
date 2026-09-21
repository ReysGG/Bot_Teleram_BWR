# Product claim and guidance - dev review

Preview: http://127.0.0.1:4175/orders/DEMO-CLAIM-001

## Deployed after owner approval

- Web order detail loads existing postDeliveryInstructions, postDeliveryEntities, and redeemUrl from the same product configuration used by Telegram. No migration or data rewrite.
- Dedicated helper applies existing WEB + PAID + eligible order-status policy before returning any instruction, rich link, or redeem URL. URL-only guides work; duplicate products are collapsed.
- Frontend adds a claim destination card/new-tab button, supports safe Telegram rich-text spans and text links, and links bare HTTPS URLs. React escapes text; raw HTML is never inserted. Non-HTTPS URLs and URLs containing username/password do not become links.
- Product downloads appear before usage/claim resources. Existing authenticated attachment/delivery endpoints are retained.
- Admin help text explains website and Telegram behavior; Telegram delivery logic is unchanged.
- Preview imports the actual OrderResources component with clearly synthetic invoice, code and URLs. Claim URL is example.com. Its Vite-only download middleware returns a demo text guide; it is excluded from deployment sources.

## Validation

- 920 root tests passed, 60 database/integration tests skipped.
- 13 UI tests passed, including URL-only guides, unsafe links, escaped HTML, emoji/UTF-16 entity offsets, and formatting.
- Root TypeScript/lint and frontend TypeScript/lint passed before the final admin help-text-only edit.
- Chrome preview verified claim URL/new-tab behavior, guide download event, and no horizontal overflow at 390px.
- Database integration was subsequently run on the Freestyle build VM in an internal-only Docker network with temporary PostgreSQL. Six Web order/delivery integration tests and ten guidance policy tests passed (16 total). The disposable DB and network were removed after completion. No production data was used.
- Backend telegram-app:claim-20260916 and storefront release 20260916-053805 were built on Freestyle and deployed after approval. Both public health checks passed. Backend environment and production PostgreSQL container identity stayed unchanged; workers resumed running. Production private order API rejected unsigned requests with 401. New frontend claim styles were verified. No production database migration or customer data change was performed.
