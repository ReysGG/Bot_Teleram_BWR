# Dev review: cart interactions, orders, account

Dev review completed before deployment. The owner then explicitly approved deployment; release 20260916-044753 is live on the replacement Freestyle VM.

## Open the interactive local preview

- http://127.0.0.1:4175/shop
- http://127.0.0.1:4175/cart
- http://127.0.0.1:4175/orders
- http://127.0.0.1:4175/account
- http://127.0.0.1:4175/products/demo-mail

Restart from the repository root:

```powershell
node node_modules/vite/bin/vite.js --config storefront/qa/dev/vite.config.ts
```

This preview imports the actual UI components. Its Vite-only aliases replace Clerk, Next navigation/image wrappers, and CartProvider with a local in-memory demo. The yellow banner identifies synthetic data. Refresh resets the demo cart. Checkout does not create an invoice or payment. No production API keys are loaded and no database is contacted. The qa folder is excluded by the existing deployment archive allowlist.

## Changes

- Add buttons use local loading state, while CartProvider retains its existing serialized write lock. Only the clicked button says Menambahkan. Other buttons are temporarily guarded against concurrent writes without showing a loading label. Out-of-stock buttons retain their disabled appearance.
- Cart preview ignores null-focus blur when a clicked control becomes disabled. Interaction pins the preview until explicit close, Escape, outside pointer, or keyboard focus moves outside. Quantity/deletion controls continue to use existing setQuantity/remove actions.
- Full cart rows show saving only on the affected row; quantity respects maxQuantity.
- Orders use summary icons, compact aligned heading, status filters, invoice/product search, copy-invoice action, file availability and a blue detail action. Responsive cards preserve status and invoice data. Generic product icons are used because the existing order summary contract does not include product thumbnails.
- Buy now remains solid blue; add to cart on product details uses a light-blue outlined treatment.
- SupportCard links to https://t.me/davidboysaja on account, order list, order detail, and product detail. It prompts users to provide the invoice; no message is sent automatically.
- AccountHero composes all six supplied public/assets PNGs. Named copies live in public/account. AccountDashboard has structured shortcuts, wallet panel, and support panel.

## Validation

- Frontend typecheck and lint passed.
- Root TypeScript check passed.
- Root tests: 910 passed, 60 skipped.
- UI suite: 9 passed via `npx vitest run --config tests/storefront-preview.config.ts`.
- Regression tests cover a focused quantity control becoming disabled, outside close and Escape, loading/privacy states, per-button loading, and guarded quantity/deletion callbacks.
- Chrome dev: only clicked add button shows loading; after decrement completes, preview remains open and product buttons retain their normal labels; deleting final item shows empty preview without closing it.
- Chrome dev: successful-order filter and no-match search work; differentiated purchase button colors verified; account/orders at 320/390px show no horizontal page overflow.
- After owner approval, the production Docker build ran on Freestyle, including typecheck, lint, 4 frontend tests, and Next build. Candidate/live container health passed. Public health, catalog, signed-out account/orders, and product routes returned 200; support link and distinct action colors were verified in Chrome. New account artwork checksum matches the local asset. Signed-in interactions were validated in the isolated dev review; no real cart/order mutation was performed for production acceptance.

Screenshots are in design-review: dev-cart-after-decrease.png, dev-orders-mobile.png, dev-account-desktop.png, dev-orders-desktop.png.
