# Cart preview, order layout, and image optimization - 2026-09-16

Frontend release: 20260916-032912 on the replacement Freestyle VM.

## Changes

- Header cart opens an accessible preview on mouse hover or click/tap. Keyboard Enter/Space opens it; Escape, outside pointer, blur outside, and the close button dismiss it.
- Existing CartProvider snapshot supplies thumbnails, item quantities, prices, subtotal, loading/error states, and sign-in prompt. Opening preview does not fetch or mutate cart data.
- Orders use the shared PageHeading and original account/order illustration, summary cards, and responsive order cards below 800px. All order values still come from the existing account API.
- Local heading, hero, benefit, and fallback images use Next Image optimization. Protected QR and external/product-provider image paths retain their existing access behavior.
- Product card detail links do not prefetch every product route while browsing the catalog.

## Verification

- Frontend typecheck and lint passed; Docker build runs typecheck, lint, existing frontend tests, and Next build.
- Backend TypeScript check passed after placing frontend UI fixtures under storefront/qa.
- `npx vitest run --config tests/storefront-preview.config.ts`: 5 tests passed, covering hover/click/Escape/outside dismissal, signed-out privacy, loading/errors, and invoice/file/link rendering.
- Chrome: production guest cart preview verified on desktop and mobile, keyboard opening, mobile click and close. Mobile 390px viewport has no horizontal overflow.
- Signed-in product rows verified with mocked cart data in component tests; order list visual QA uses synthetic invoices in a local-only static fixture. No real customer order was created or changed for QA.
- Hero mobile optimized image loads and preserves the original layout.

## Measured image payloads

WebP, quality 75, at 1080px (fallback 256px):

| Asset | Original bytes | Optimized bytes | Reduction |
| --- | ---: | ---: | ---: |
| Shop heading | 1345624 | 8228 | 99.4% |
| Home hero | 1836658 | 19138 | 99.0% |
| Product fallback | 59422 | 3874 | 93.5% |

These are image payload measurements, not a Lighthouse score or whole-page speed claim. Source: live image endpoint; see design-review/image-optimization.json. Implementation reference: https://nextjs.org/docs/app/api-reference/components/image

Screenshots: design-review/cart-preview-mobile.png and design-review/orders-mobile-fixture.png (synthetic data).
