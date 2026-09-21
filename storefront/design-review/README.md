# BWR TELE design review - 2026-09-16

Review requested through the user's ChatGPT conversation in Chrome:
https://chatgpt.com/c/6aa8ca5d-609c-83ec-aed5-c87756c90d8c

## Inputs

- desktop-shop.png: live production desktop catalog screenshot.
- mobile-shop.png: live production catalog at 390px.
- mobile-account.png: live signed-out account gate at 390px.
- Existing original BWR TELE character and design history in the conversation.

## Output

- bwr-desktop-mobile-mockup.png: generated comparison of desktop catalog and mobile QRIS invoice.

This is a visual proposal. It has sample amounts, dates, stock counts, and a dummy QR; it is not a payment screen to publish as an image. The payment amount in the QR card and invoice total do not match in the mockup, and the sample timer is not the actual store payment window. Production must always render backend amounts, expiry, and QR data. Do not copy invented counts, delivery promises, or provider choices from the mockup.

Current production changes already deployed: email-only registration, QRIS first in payment options, pending QRIS instructions before summary on mobile, smaller-screen overflow protection, and explicit expired/cancelled/refunded payment labels.

- bwr-character-asset.png: generated 1536x1024 RGBA PNG, transparent pixels verified (alpha range 0-254). This is a raster illustration, not an editable SVG vector. Downloaded after generation finished; not a screenshot of the image.

- AUDIT.md: completed text review from ChatGPT. Both image generation requests finished before download.

Delivery note: WhatsApp Desktop notification was attempted, but Windows Computer Use helper could not connect. No WhatsApp message was sent.
