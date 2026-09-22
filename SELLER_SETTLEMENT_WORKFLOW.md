# Seller settlement workflow (local)

Seller money is released in two separate steps:

1. **Buyer approval:** after delivery, the buyer presses `Produk bisa digunakan`.
   This is an explicit usability confirmation. A product rating remains optional
   and is stored separately from seller rating.
2. **Wallet release:** the approval transaction creates/updates the seller sale,
   moves the seller net amount to `available`, and writes an idempotent journal
   entry. No release happens merely because payment is PAID or delivery is SENT.

The seller can then press `Ajukan pencairan`. The request atomically moves
`available -> held` and enters the admin queue. Admin actions are separate:

```text
REQUESTED -> APPROVED -> PROCESSING -> PAID
     |          |             |
     +-> REJECTED             +-> FAILED_FINAL / MANUAL_REVIEW
```

`Approve` does not send money. The admin must begin the transfer and record a
reference before `PAID`. Ambiguous transfer outcomes remain held and require
manual review. Every transition is conditional, locked by withdrawal ID, and
has a unique journal source key.

The implementation is local-only while seller settlement is tested. Production
flags remain disabled and no production database migration or payout is run.

## Visual reference

The seller approval/wallet/payout mockup was requested through Chrome ChatGPT
using synthetic data and the existing storefront palette:

https://chatgpt.com/c/6ab2836b-b3b8-83ec-9534-caaae5e6f41a
