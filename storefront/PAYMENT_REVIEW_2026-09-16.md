# Web payment incident and identity UI review

Global checkout maintenance was enabled using the existing authenticated admin
endpoint after the owner reported a paid expired invoice with no wallet credit.
**Update 2026-09-16: maintenance released after deployment, targeted invoice audit, worker reconciliation, and public health checks passed. The owner will handle the late-payment manual credit; no credit was issued by this deployment.**

Read-only evidence came from the existing authenticated admin HTML pages; no
direct production SQL was performed. Browser admin login had expired. A separate
request for scoped direct database read approval remains unanswered.

## Identified invoice

- Invoice: TGS-20260915-467A7796.
- Order: 5632e678-d3ae-4ffe-9a99-d7658164259c.
- Product: Mail Outlook/Hotmail (Random), one unit.
- Total Rp567 = product Rp500 + unique code Rp67.
- Created 2026-09-15 23:12:18 Asia/Jakarta; expired 23:17:18.
- Order/payment EXPIRED; no paid timestamp, no delivery, wallet displayed Rp0.
- QRIS ledger: SHOPEE_PARTNER, WEB_SESSION, unmatched.
- Shopee ledger: amount Rp567 at 23:19:28, status UNMATCHED, no invoice linked.
- Android reconciliation ledger: Rp567 at 23:19:32, unmatched/unlinked.
- Payment is about 2m10s after invoice expiry. This is evidence of a matching
  amount/time candidate, not completed authoritative reconciliation. Validate
  provider/account/device binding, uniqueness and cross-source dedupe before credit.
- Existing policy credits product value excluding unique code, so expected credit
  is Rp500 if the evidence is confirmed. No manual credit has been made.

## Fixes deployed on 2026-09-16

- Automatic Web account initialization through existing authenticated POST after
  cart GET reports account_setup_required; no GET mutations. Existing account
  links still require legacy proof and unverified email is rejected. Checks stop
  stale session results and repeated auto attempts.
- Account setup copy and cart buttons explain actionable states.
- Web expired-payment wallet credit validates Web wallet ownership and skips
  Telegram notification creation; expiry alone does not cause a credit.
- Admin dashboard/list/detail resolves verified primary email from the bound
  Clerk account server-side, with existing/masked email fallback. No persisted
  user/order data rewrite. Web orders no longer label internal web: IDs as Telegram.
- Telegram direct-message composer hidden for Web orders and POST endpoint rejects
  Web recipients. Existing Telegram behavior preserved.

Checks: 31 focused unit tests passed; 21 disposable database tests passed,
including Rp567 expired Web credit producing exactly one Rp500 ledger entry and
no Telegram notification/delivery. Root/frontend typecheck and lint passed before
the last test additions. Both frontend and backend were built on the replacement Freestyle VM and deployed. Backend environment and PostgreSQL container identity were preserved; no migration ran.

Disposable DB still present: web-payment-review-disposable-20260915, container
70db2a06a74ba5c9dd0254eea56dc0f7af2dc75e612d98e129e13061002b0b6e,
localhost:55439, database cart_disposable_payment_review. Only remove this test
container after remaining verification. Build on VPS as instructed by owner.

Post-deployment read-only verification: Web account heading and email label visible, email rendered, Telegram message composer absent. Staging credential files removed locally. Local Docker Desktop is currently stopped, so cleanup of the named disposable DB container could not be verified; do not touch any other DB volume.
