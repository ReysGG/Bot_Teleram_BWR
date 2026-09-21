# BWR Tele SMS OTP design assets

Generated through the user's Chrome ChatGPT session:
https://chatgpt.com/c/6ab0e2bf-e9ac-83ec-8a1b-140109bbf51f

| File | Purpose | Size |
| --- | --- | --- |
| `desktop-mockup.png` | Desktop concept | 1435 Ã— 1096 |
| `mobile-mockup.png` | Mobile concept | 853 Ã— 1844 |
| `mobile-mockup-final.png` | Corrected mobile concept with safe help-button gutter | 853 Ã— 1844 |
| `sms-hero-source.png` | Transparent hero illustration | 1536 Ã— 1024 |
| `sms-waiting-source.png` | Transparent waiting/empty illustration | 1254 Ã— 1254 |

The website uses optimized WebP derivatives under `storefront/public/sms/`.
Mockup numbers, country stock counts and service logos are visual examples only.
The actual application uses the original BWR Tele header, backend prices, private
account state and no invented country stock counts. The corrected mobile concept is saved as design/sms/mobile-mockup-final.png.

Public reference assets supplied to ChatGPT:

- `https://store.buildwithreys.com/headings/orders-heading.png`
- `https://store.buildwithreys.com/headings/shop-heading.png`
- `https://store.buildwithreys.com/illustrations/invoice-success.webp`
- `https://store.buildwithreys.com/icon.svg`

Local file attachment was blocked by Chrome's file-URL permission; these public
URLs and an explicit style brief were used instead. No private data was sent.

## SMSPool catalog and brand assets

The public snapshot in provider-services-20260921.json contains 1,386 services. The website exposes all of them through full-list search and 24-card pagination. It does not invent stock counts or provider logo URLs. Local hashed Simple Icons cover 158 exact service names; other services remain selectable with a neutral phone fallback. See storefront/public/sms/brands/LICENSE-simple-icons.md for attribution.
