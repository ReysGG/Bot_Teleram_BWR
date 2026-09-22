# Seller page review - local

Source review conversation: [ChatGPT seller/admin UI review](https://chatgpt.com/c/6ab2836b-b3b8-83ec-9534-caaae5e6f41a)

## Shared rules

- Keep the storefront BWR Tele blue/white token system for seller pages.
- Keep the existing `SiteHeader`, `SiteFooter`, `SellerLayout`, `SellerPanel`,
  `SellerStatGrid`, status badges, tables, forms, and confirmation dialogs.
- Every create, edit, upload, review, and payout action gets its own route.
- Index pages remain browse/search/status pages; they do not contain large forms.
- Local mode seeds realistic synthetic seller data so every state is reviewable.

## Reviewed routes

| Route | Review focus | Local fixture |
| --- | --- | --- |
| `/seller/login` | Dedicated seller access card with BWR themed artwork | Preview entry and production Clerk handoff |
| `/seller` | Four summary metrics and recent activity | Active seller, wallet buckets |
| `/seller/products` | Product/draft list and clear new-product action | Two products and one submitted draft |
| `/seller/products/new` | Dedicated draft form | Draft submission state |
| `/seller/products/[id]/stock/upload` | Dedicated stock upload flow | One available synthetic stock item per product |
| `/seller/sales` | Settlement status table | Empty/pending/available states supported |
| `/seller/balance` | Pending, available, held, debt buckets | Rp35.000 pending, Rp125.000 available, Rp50.000 held |
| `/seller/withdrawals` | Browse-only payout list | One REQUESTED payout |
| `/admin/seller-products/reviews/[id]` | One draft decision page | Submitted draft |
| `/admin/sellers/withdrawals/[id]` | One payout transition page | REQUESTED payout |

The local seed is idempotent and runs only against the disposable storefront
database. It never creates production users, sends email, or touches the
production Telegram bot.

## Asset references used in the implementation

The ChatGPT review is used as composition guidance only. The implementation
keeps the existing storefront header, footer, spacing tokens, and blue palette.
Reusable `SellerIllustration` maps each seller state to an existing local asset:

- seller login: `/auth/auth-character-scene.webp`;
- empty product list: `/account/account-package.png`;
- payout and wallet states: `/account/account-wallet.png`;
- review pending state: `/illustrations/invoice-pending.webp`.

This keeps artwork replaceable without copying a second navbar or introducing a
separate seller theme.
