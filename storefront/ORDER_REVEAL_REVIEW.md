# Paid-order opening animation - dev review

Preview: http://127.0.0.1:4175/orders/DEMO-REVEAL
Use Putar ulang contoh for a fresh synthetic order. The scenario selector covers ready, processing, preorder, unpaid, expired, and delivered. Simulasikan produk siap transitions a processing example without creating a real payment or changing stock.

## Deployed after owner approval

- Original supplied six-stage PNG copied unchanged to public/animations/order-opening.png. SVG clipping windows isolate unequal-width frames and align their base; no raster re-generation.
- OrderReveal receives only the authenticated order's ID, product name, payment/order/delivery states and file counts.
- A 2-second native dialog opens only after PAID + eligible order status + all requested product files ready. Six frames finish at the digital-products reveal. Skip/Escape cancel immediately.
- On completion/skip, focus and viewport move to the existing product-download section. No automatic download, claim, payment confirmation, stock mutation or redirect to third parties.
- Local-storage markers prevent repeat animation for the same order on the same browser. Markers only affect presentation, never authorization. If storage is blocked, in-memory tracking works for the current page session. Orders with previously downloaded units skip the overlay.
- Reduced-motion preference skips the animation. Artwork load failure or unavailable dialog support leave normal order content accessible.
- Paid processing uses an empty package status, with read-only router.refresh calls every four seconds, serialized by transition state and bounded to ten attempts. Hidden tabs make no refresh call. Manual refresh remains available.
- Paid preorder uses a closed package. Unpaid/expired/cancelled/refunded/delivered orders do not show a success animation.
- Helper-copy removal is deployed together with this animation. Production release is 20260916-082219; progress dashes were removed at owner request.

## Validation

- 920 root tests passed, 60 DB/integration tests skipped (no financial/backend changes in this task).
- 21 UI tests passed: status gating, all six frames, 2-second close, remount suppression, skip/Escape/cleanup, reduced motion, image failure, storage failure, already-downloaded orders, processing-to-ready and polling bounds/visibility.
- Root TypeScript and frontend TypeScript/lint passed.
- Chrome dev: modal opens, reaches final frame, closes and focuses order-products; skip works; processing and preorder use appropriate copy; 320px dialog bounds fit the viewport.
- After dev approval, production build ran on Freestyle and the new release passed health checks. Sprite checksum and absence of progress-dash CSS were verified on the public domain.
