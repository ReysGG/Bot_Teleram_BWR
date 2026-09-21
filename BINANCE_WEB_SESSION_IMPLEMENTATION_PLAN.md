# Binance Pay Web-Session Verification Plan

Status: planning only  
Date: 2026-09-08  
Target application: Independent Telegram Store  
Target payment method: `BINANCE_INTERNAL`

## Ringkasan Eksekutif

Rencana ini mengubah verifier `BINANCE_INTERNAL` agar pembayaran internal
Binance-to-Binance dapat diperiksa tanpa Binance API key/secret. Verifikasi
menggunakan sesi web Binance yang diunggah melalui halaman admin, divalidasi,
dan disimpan terenkripsi dengan `PAYMENT_SESSION_ENCRYPTION_KEY`.

Keputusan utamanya:

- `BINANCE_INTERNAL` tetap menjadi metode Binance Pay yang sudah ada;
- `USDT_BEP20` tetap terpisah sebagai transfer on-chain jaringan BSC;
- web session menjadi verifier utama dan official API menjadi fallback opsional;
- versi pertama tetap mewajibkan Payment Details Order ID dari pembeli;
- exact amount, akun penerima, status, arah transaksi, Order ID, dan waktu harus
  cocok seluruhnya;
- transaksi ambigu, session expired, CAPTCHA, response berubah, atau upstream
  error tidak boleh mengonfirmasi maupun me-refund order;
- satu transaksi hanya boleh mengonfirmasi satu invoice dan satu credential
  tidak boleh terkirim dua kali;
- rollout dilakukan bertahap: read-only polling, matching tanpa auto-confirm,
  controlled payment, baru aktivasi normal;
- maintenance, backup terverifikasi, rollback image, disposable database, dan
  audit worker/delivery wajib dilakukan sebelum checkout production dibuka.

Dokumen ini hanya spesifikasi. Belum ada cookie yang diambil, migration yang
dijalankan, fitur yang diaktifkan, atau perubahan production yang dilakukan.

## 1. Purpose

This document defines the implementation, validation, rollout, and rollback
plan for verifying Binance-to-Binance payments without requiring a Binance API
key and API secret.

The intended customer payment is an internal Binance Pay transfer. It is not a
BEP20 blockchain transfer. The existing `USDT_BEP20` method remains a separate
on-chain payment option and must not be removed or silently redirected.

The proposed verifier uses an authenticated Binance web session to read the
merchant account's Payment History through the private endpoint used by the
Binance website. This is an undocumented web contract, not an official public
API. The implementation must therefore be encrypted, observable, reversible,
rate-limited, and fail closed.

No real Binance cookie, token, account identifier, customer information, or
production credential belongs in this document, source control, test fixtures,
application logs, or chat output.

## 2. Current State

The application already supports two distinct USDT payment methods:

| Method | Transfer type | Current evidence | Current verifier |
| --- | --- | --- | --- |
| `BINANCE_INTERNAL` | Binance account to Binance account | Buyer-submitted Payment Details Order ID | Official signed Binance API |
| `USDT_BEP20` | On-chain BSC token transfer | Transaction hash | Public BSC RPC |

The current `BINANCE_INTERNAL` implementation already provides:

- an immutable recipient Binance ID snapshot;
- a manually configured IDR/USDT rate snapshot;
- a unique micro-USDT amount per active invoice;
- numeric receipt ID and `M_P_` alias normalization;
- serialized Order ID claim protection;
- invoice and verification expiry windows;
- exact USDT amount validation;
- recipient Binance ID validation;
- transaction time validation;
- provider transaction uniqueness;
- Telegram copy, submit, refresh, and navigation actions;
- an authenticated admin ledger and recheck action;
- verifier-only policy with no manual payment bypass;
- the shared idempotent payment confirmation and fulfillment path.

The current blocker is operational: enabling `BINANCE_INTERNAL` requires
`BINANCE_API_KEY` and `BINANCE_API_SECRET`, and those credentials are not
configured in production.

## 3. Verified Web Direction

The logged-in Binance Payment History page uses this private endpoint:

```text
POST https://www.binance.com/bapi/pay/v1/private/binance-pay/transaction/history-list
```

Observed request shape:

```json
{
  "type": "...",
  "startDate": 0,
  "endDate": 0,
  "lastTransactionTime": 0,
  "size": 20
}
```

Observed pagination behavior:

```text
rows                  = data.transactionList
more pages            = data.hasMore
next lastTransactionTime = final row transactionTime
```

The web application also references a transaction-detail endpoint:

```text
POST https://www.binance.com/bapi/pay/v1/private/binance-pay/transaction/detail
```

The detail call appears to receive the selected transaction identifier and the
Payment Details surface exposes a Binance Pay Order ID.

Observed history/detail information includes or presents:

- transaction time;
- direction such as `Received` or `Paid`;
- amount;
- currency;
- completion status;
- counterparty name or account context;
- transaction identifier;
- Binance Pay Order ID in Payment Details.

These observations are sufficient to justify an implementation spike. They are
not sufficient to enable automatic production confirmation. The exact response
envelope, status values, account-identity fields, cookie requirements, headers,
and detail request body must be captured as sanitized fixtures during the
contract-validation phase.

## 4. Architecture Decision

### 4.1 Keep the existing payment method

Do not introduce another customer-facing payment method. Extend
`BINANCE_INTERNAL` with verifier strategies:

```text
BINANCE_INTERNAL
  -> WEB_SESSION      primary target
  -> OFFICIAL_API     optional fallback when configured
```

This preserves the existing checkout, amount allocation, Order ID entry,
payment confirmation, stock allocation, delivery, order history, and ledger
behavior.

### 4.2 Keep BEP20 separate

`USDT_BEP20` remains independently configurable and continues to require:

- BSC chain ID 56;
- the snapshotted token contract;
- the snapshotted recipient address;
- exact token units;
- a unique transaction hash;
- block time inside the invoice window;
- the configured confirmation count.

The Telegram copy must explicitly distinguish the methods:

```text
Binance Pay (Binance-to-Binance)
USDT BEP20 (BSC network)
```

### 4.3 Do not add Binance to the Android bridge

The Binance web-session verifier is the intended primary evidence source.
Android notification support is outside this plan because notification delivery
can be delayed or lost and may omit the Order ID, receiver identity, or other
fields needed for an unambiguous match.

### 4.4 Require the buyer's Order ID in version 1

The first production version continues to require the buyer to submit the
Payment Details Order ID. Exact amount and time remain mandatory secondary
checks, but amount-only automatic confirmation is not enabled in version 1.

This gives the matcher a provider-owned transaction identity and safely
resolves payments made at the same second or for the same amount.

## 5. Safety Invariants

The implementation must preserve all of the following invariants:

1. One Binance provider transaction can confirm at most one invoice.
2. One invoice can bind to at most one Binance provider transaction.
3. One submitted Order ID cannot be claimed by two invoices, including numeric
   and prefixed aliases.
4. Only a completed incoming USDT payment is eligible.
5. The amount must equal the exact snapshotted micro-USDT amount.
6. The receiver/account must match the invoice recipient and session snapshot.
7. The provider transaction time must be inside the original invoice window,
   including only an explicitly defined clock-skew allowance.
8. An expired, cancelled, refunded, already-paid, or otherwise terminal invoice
   cannot be fulfilled by a later poll.
9. A malformed, challenged, unauthorized, rate-limited, or unavailable Binance
   response never confirms or rejects a customer payment as unpaid.
10. Ambiguous evidence never selects the first row arbitrarily.
11. Repeated polls, refresh actions, cron overlap, and application restarts are
    idempotent.
12. Payment confirmation uses the existing transactional
    `confirmOrderPayment()` path.
13. A verifier/session error cannot cause stock release or an automatic wallet
    refund.
14. Digital credentials must never be delivered twice.
15. Manual admin confirmation remains unavailable for Binance and BEP20.

## 6. Proposed Runtime Flow

```text
Buyer selects Binance Pay (Binance-to-Binance)
  -> checkout snapshots recipient, rate, amount, expiry, verifier, session
  -> Telegram sends recipient ID, exact USDT amount, and expiry
  -> buyer transfers internally in Binance
  -> buyer opens Payment Details
  -> buyer submits Binance Pay Order ID
  -> targeted poll reads recent Payment History
  -> optional detail lookup resolves the provider Order ID
  -> normalized transaction is persisted idempotently
  -> matcher locks transaction and invoice attempt
  -> matcher revalidates identity, direction, status, currency, amount, and time
  -> evidence is bound atomically
  -> auto-confirm gate calls confirmOrderPayment()
  -> existing fulfillment/outbox workers deliver the product once
```

Routine polling runs independently of a buyer refresh so missed refresh clicks
do not prevent a valid payment from being discovered.

## 7. Evidence Gates Before Coding the Final Parser

The private Binance contract is not considered stable until all gates below are
answered with sanitized evidence. No raw cookies or personal values should be
recorded in fixtures.

### Gate A: history contract

Confirm:

- the exact HTTP method and URL;
- the exact request body and meaning of `type`;
- whether date values use milliseconds, seconds, or another unit;
- whether `lastTransactionTime=0` means the newest page;
- the exact success envelope and business success code;
- the exact empty-list envelope;
- the exact `hasMore` type;
- the sort order;
- whether two rows may share the same `transactionTime`;
- the behavior when the pagination timestamp is repeated;
- the maximum accepted page size.

### Gate B: transaction field contract

Confirm the exact field/value representation for:

- incoming direction;
- completed status;
- USDT currency;
- amount precision;
- provider transaction ID;
- counterparty data;
- account/via-account data;
- transaction timestamp;
- transaction type.

### Gate C: detail contract

Confirm:

- the exact request body;
- whether it uses history transaction ID or Order ID;
- the exact response field containing Payment Details Order ID;
- whether numeric and `M_P_` aliases both occur;
- whether detail calls are rate-limited separately;
- whether details remain available after ordinary session rotation.

### Gate D: account binding

Prove one stable, non-secret identity that binds the session to the configured
merchant recipient. Preferred evidence order:

1. receiver Binance ID in transaction detail;
2. signed-in account identity endpoint used by the Binance web UI;
3. stable account/via-account value proven to equal the recipient setting;
4. another provider-owned account identity that is stable across sessions.

If no stable receiver/account identity can be proven, polling may be implemented
as read-only evidence collection, but automatic confirmation must remain off.

### Gate E: amount precision

Run a controlled small-value transfer to confirm:

- Binance accepts the application's six-decimal exact amount;
- Payment History preserves the amount without rounding;
- the recipient receives the exact amount shown in the invoice;
- fees do not reduce the received amount;
- string parsing to micro-USDT is lossless.

If Binance supports fewer decimals than the current allocator, change the
allocator before checkout activation. Do not round a generated invoice amount
after the invoice is created.

### Gate F: session behavior

Confirm:

- which cookies are necessary;
- whether an anti-CSRF header is required;
- whether the call works from the production server region;
- logout/expiry response behavior;
- CAPTCHA/challenge response behavior;
- whether a new IP triggers email, device, or 2FA verification;
- an acceptable polling interval without rate-limit escalation.

## 8. Data Model Plan

All schema changes must be additive and introduced through a reviewed Prisma
migration. No existing order, payment, stock, wallet, or delivery row is reset
or rewritten.

### 8.1 Enums

Proposed enums:

```text
enum BinanceInternalVerifierMode {
  OFFICIAL_API
  WEB_SESSION
}

enum BinanceWebSessionStatus {
  PENDING_VALIDATION
  ACTIVE
  CHALLENGED
  EXPIRED
  ERROR
  REVOKED
}

enum BinanceWebTransactionStatus {
  RECEIVED
  MATCHED
  CONFIRMED
  UNMATCHED
  AMBIGUOUS
  REJECTED
}
```

`BinanceInternalVerifierMode` may use a string column instead of a PostgreSQL
enum only if that matches the final migration policy. The value remains a
closed application-level set either way.

### 8.2 `BinanceWebSession`

Proposed fields:

```text
id                         String primary key
name                       String
encryptedCookieJar         Text nullable after revoke
cookieEncryptionIv         String nullable after revoke
cookieEncryptionTag        String nullable after revoke
cookieFingerprint          String unique nullable
recipientBinanceId         String nullable until validated
accountFingerprint         String nullable until validated
status                     BinanceWebSessionStatus
pollingLeaseToken          String unique nullable
pollingLeaseExpiresAt      DateTime nullable
pollCursorTime             BigInt nullable
lastValidatedAt            DateTime nullable
lastSuccessfulPollAt       DateTime nullable
lastErrorCode              String nullable
lastErrorAt                DateTime nullable
revokedAt                  DateTime nullable
revokedBy                  String nullable
createdBy                  String
updatedBy                  String
createdAt                  DateTime
updatedAt                  DateTime
```

Rules:

- cookie ciphertext and all encryption metadata are either all present or all
  absent;
- an `ACTIVE` session must have a recipient ID, account fingerprint, and
  validation timestamp;
- a revoked session has no credential ciphertext or lease;
- account fingerprints use a versioned, provider-scoped input;
- session rows are retained for audit and are not hard-deleted;
- only one selected primary session may be used for new Binance invoices.

### 8.3 `BinanceWebTransaction`

Proposed fields:

```text
id                              String primary key
sessionId                       String
accountFingerprint              String
providerTransactionId           String
providerOrderId                 String nullable
providerOrderIdAliases          Json
direction                       String
providerStatus                  String
currency                        String
amountMicros                    BigInt
counterpartyName                String nullable
viaAccountValue                 String nullable
receiverBinanceId               String nullable
occurredAt                      DateTime
rawPayloadHash                  String
status                          BinanceWebTransactionStatus
binanceInternalPaymentAttemptId String unique nullable
firstSeenAt                     DateTime
confirmedAt                     DateTime nullable
rejectionReason                 String nullable
createdAt                       DateTime
updatedAt                       DateTime
```

Required constraints and indexes:

```text
unique(accountFingerprint, providerTransactionId)
unique(binanceInternalPaymentAttemptId)
index(sessionId, occurredAt)
index(accountFingerprint, amountMicros, occurredAt)
index(status, occurredAt)
index(providerOrderId)
```

Do not store the complete raw upstream response. Store only normalized bounded
fields plus a SHA-256 hash of a stable canonical representation for audit.

### 8.4 `BinanceInternalPaymentAttempt` additions

Proposed additions:

```text
verifierMode                     BinanceInternalVerifierMode
binanceWebSessionIdSnapshot      String nullable
binanceAccountFingerprintSnapshot String nullable
binanceWebTransactionId          String unique nullable
```

The existing fields remain for compatibility:

- `submittedOrderId`;
- `canonicalTransactionId`;
- observed amount/currency/type/status;
- observed payer and receiver information;
- observed transaction time;
- verification and confirmation timestamps;
- failure reason.

New attempts snapshot the chosen verifier and session identity. Existing rows
default to `OFFICIAL_API` so historical meaning is retained.

Snapshot fields must be protected from mutation after invoice creation. A
session may later be revoked, but the invoice's non-secret identity snapshot
must remain unchanged.

### 8.5 Runtime settings

The existing `StoreRuntimeSetting.binanceInternalRecipientId` remains the
merchant destination setting. Add only the minimum database-owned selection or
audit field needed to choose the active web session. Do not put cookie material
in `StoreRuntimeSetting`.

## 9. Cookie and Session Security

### 9.1 Storage

- Reuse `PAYMENT_SESSION_ENCRYPTION_KEY` and the existing AES-256-GCM helper.
- Encrypt the complete validated cookie jar before writing it to PostgreSQL.
- Store IV, authentication tag, and ciphertext separately.
- Store only a one-way cookie fingerprint for operator display.
- Never display decrypted cookies after submission.
- Never return cookie material from a server component, API response, or form
  error.

### 9.2 Validation

The cookie parser must:

- accept a JSON array only;
- impose a maximum number of entries;
- bound domain, path, name, and value lengths;
- reject control characters and invalid HTTP header characters;
- reject duplicate domain/path/name tuples;
- discard expired cookies;
- allow only explicitly approved Binance domains;
- send only cookies whose domain, path, expiry, and secure attributes match the
  exact HTTPS request URL.

The domain allowlist must be narrowly based on the verified request hosts. Do
not accept arbitrary domains containing the word `binance`.

### 9.3 Revocation and rotation

Revoking a session must atomically:

- set status to `REVOKED`;
- clear cookie ciphertext, IV, and authentication tag;
- clear the cookie fingerprint if policy requires it;
- clear active polling leases and cursors;
- store actor and time audit fields;
- prevent the session from being selected for new invoices.

Rotation procedure:

1. upload a new session;
2. validate it read-only;
3. prove the same recipient/account identity;
4. select it for new invoices;
5. keep pending invoice snapshots on their original session while valid;
6. revoke the old session only when safe.

If a pending invoice's snapshotted session is revoked, do not silently bind it
to a different account. An explicitly reviewed same-account recovery policy may
be added later, but it is not part of version 1.

### 9.4 Operational protections

- Use a clean admin-only browser profile for exporting cookies.
- Accept cookie upload only through the authenticated HTTPS admin surface.
- Apply existing CSRF/origin validation to all session mutations.
- Require confirmation dialogs for revoke, select-primary, and replacement.
- Disable forms while submitting and show an explicit processing state.
- Redact upstream errors to stable operator codes.
- Never place cookie strings in command arguments, process listings, shell
  history, screenshots, logs, or deployment environment files.

## 10. Web Contract Parser

Create a pure parser module whose tests require no network and no database.

Proposed module:

```text
src/server/payment/binance-web-contract.ts
```

Responsibilities:

- validate the success envelope;
- validate `transactionList` and `hasMore` types;
- validate every identifier as a bounded string;
- parse timestamps without converting identifiers to numbers;
- parse amounts into exact integer micro-USDT;
- normalize direction, status, and currency;
- reject or safely skip unsupported transaction types;
- derive a stable raw row hash;
- extract a stable account identity only when the contract proves it;
- return a typed page and a safe next cursor;
- distinguish contract failure from an empty valid page.

Parser result categories:

```text
ok
account_mismatch
contract_unknown
```

The parser must not guess unknown status numbers or translate arbitrary text
using substring matching. Accepted provider values must come from captured,
reviewed fixtures.

## 11. HTTP Poller

Proposed module:

```text
src/server/payment/binance-web-poller.ts
```

Responsibilities:

- own the fixed Binance endpoint URLs;
- build bounded request bodies;
- construct the applicable cookie header;
- set only verified required headers;
- use `cache: no-store`;
- apply a short request timeout;
- follow no redirects automatically;
- cap response size before parsing;
- reject non-JSON responses;
- classify HTML as a challenge;
- classify 401/403 as unauthorized;
- classify 429 as rate-limited;
- classify 3xx and known anti-bot responses as challenge;
- classify 5xx/network failures as upstream/transient errors;
- never include response bodies in thrown/logged errors.

Poll result categories:

```text
ok
unauthorized
rate_limited
challenge
contract_unknown
response_too_large
upstream_error
```

The history call is the normal polling path. Detail calls are bounded and made
only for rows that could satisfy an active invoice or buyer-submitted Order ID.

## 12. Polling Worker

Proposed module:

```text
src/server/payment/binance-web-worker.ts
```

Worker behavior:

- select only `PENDING_VALIDATION` or `ACTIVE` sessions;
- claim a short database-backed polling lease before network I/O;
- limit sessions and pages per invocation;
- begin routine polling from the newest page with a bounded overlap;
- detect cursor/time loops;
- persist a complete page and its next cursor transactionally;
- use `createMany(..., skipDuplicates: true)` or an equivalent idempotent write;
- activate a new session only after identity validation succeeds;
- mark safe error codes without recording raw response data;
- release the lease on success and all controlled failure paths;
- allow an expired lease to be reclaimed after worker termination.

Recommended initial limits:

```text
poll interval             30 seconds
sessions per cron run      1
history pages per session  3
targeted refresh pages     6
history page size         20 or verified safe maximum
detail calls per run      10
lookback window           24 hours maximum
```

Limits must be environment-configurable only where operational tuning is
needed. Security-sensitive endpoint hosts and accepted contract values remain
code-owned.

## 13. Order ID Normalization

All Binance identifiers remain strings. Never parse an Order ID or provider
transaction ID into a JavaScript number.

Existing normalization remains the basis:

```text
numeric ID
M_P_<numeric ID>
configured legacy prefix, if retained
provider transaction ID
```

The normalized transaction ledger may contain several aliases, but exactly one
canonical provider transaction identity must own the claim.

Rules:

- reject empty, overlong, or invalid-character identifiers;
- lock on a stable receipt identity before assignment;
- query both submitted and canonical aliases when detecting reuse;
- preserve the value shown by the buyer separately from the provider identity;
- do not accept a screenshot or typed Order ID as proof without provider data.

## 14. Exact Amount Handling

The existing allocator stores exact amounts in micro-USDT:

```text
1 USDT = 1,000,000 micro-USDT
```

Example:

```text
invoice display  : 12.345678 USDT
stored amount    : 12345678 micro-USDT
provider amount  : "12.345678"
match            : exact
```

Non-matches:

```text
"12.345677"   one micro-USDT short
"12.345679"   one micro-USDT over
"12.3456789"  unsupported non-zero precision beyond six decimals
"12,345678"   unknown locale representation unless explicitly verified
```

No floating-point comparison, epsilon, rounding, or tolerance is allowed.

The current unique suffix range is 1 through 999 micro-USDT. It can remain only
after Gate E proves Binance accepts and preserves that precision.

## 15. Matching Policy

A web transaction is eligible only when every required condition is true:

```text
attempt.verifierMode                  = WEB_SESSION
attempt.status                        = VERIFYING or VERIFIED
order.status                          = PENDING_PAYMENT
order.paymentStatus                   = PENDING
payment.status                        = PENDING
invoice expiry                        > now
session/account fingerprint           = attempt snapshot
transaction direction                 = received
transaction provider status           = completed
transaction currency                  = USDT
transaction amountMicros              = attempt.expectedUsdtMicros
transaction receiver/account          = attempt recipient/account snapshot
transaction occurredAt                inside invoice payment window
provider Order ID alias               matches submitted Order ID
transaction claim                     currently unowned by another attempt
```

Matching outcomes:

| Outcome | Meaning | Financial action |
| --- | --- | --- |
| `MATCHED` | Exactly one valid provider transaction was bound | Confirm only if auto-confirm gate is on |
| `UNMATCHED` | No eligible provider transaction | Keep pending until expiry or later poll |
| `AMBIGUOUS` | More than one eligible provider transaction | No confirmation; operator review |
| `REJECTED` | Provider evidence definitively conflicts with invoice | No fulfillment |
| `ALREADY_CONFIRMED` | Idempotent repeat | No second confirmation or delivery |

An unavailable session, network failure, challenge, or missing provider row is
not definitive evidence that the customer did not pay. Those conditions remain
pending-provider states rather than permanent payment rejection.

## 16. Concurrent Orders and Same-Second Payments

The system processes transactions in batches, not by manually checking orders
one at a time.

### Normal case

The existing advisory-locked micro-USDT allocator gives active Binance invoices
different exact amounts. One history page can therefore contain several recent
payments and the worker can match all of them in a single run.

### Same second

Two Binance transactions may share the same provider timestamp. Time is not the
primary identity. Matching uses:

```text
provider transaction ID
provider Order ID alias
account fingerprint
exact amount
invoice window
```

The Order ID distinguishes payments even if timestamp resolution is only one
second.

### Defensive duplicate-amount case

If historical/manual data nevertheless creates two active invoices with the
same amount:

```text
0 eligible invoices -> UNMATCHED
1 eligible invoice  -> MATCHED
2+ eligible invoices -> AMBIGUOUS
```

The matcher must never select `findFirst()` as a financial decision.

### Locking order

Recommended lock order:

1. advisory lock on account fingerprint plus provider transaction ID;
2. existing order/payment transition lock;
3. conditional claim of the invoice attempt;
4. conditional claim of the normalized provider transaction;
5. final invariant recheck;
6. evidence binding and verification transition;
7. `confirmOrderPayment()` through its existing idempotent contract.

Database unique constraints remain the final protection if two workers race.

## 17. Confirmation and Fulfillment

Do not duplicate payment or delivery logic inside the Binance worker.

After a transaction is `MATCHED`, the confirmation path must call:

```text
confirmOrderPayment()
```

The confirmation transaction must revalidate the bound Binance web transaction
and attempt. The `verifiedBy` value must include a bounded provider identity,
for example:

```text
binance-web:<providerTransactionId>
```

After payment confirmation, the existing fulfillment and Telegram outbox path
continues to own:

- stock allocation;
- preorder waiting behavior;
- encrypted credential rendering;
- Telegram file delivery;
- attachment and private guide ordering;
- delivery receipt deduplication;
- public success notification;
- failure/manual-review policy.

A Binance verifier error must never directly invoke the delivery refund path.

## 18. Targeted Refresh

The existing Telegram `Refresh pembayaran` action should become a real targeted
refresh for web-session invoices.

Targeted refresh steps:

1. load the order and Binance attempt for the requesting chat;
2. verify ownership and pending state;
3. reject an expired invoice as recovery-only;
4. reset only an in-memory/request-local cursor, not another session's state;
5. poll a bounded recent window using the snapshotted session;
6. persist normalized evidence;
7. resolve detail only for relevant candidates;
8. match only the selected attempt;
9. run confirmation if the gate is enabled;
10. render a specific customer status.

Routine global matching must process newest relevant evidence first so an old
`UNMATCHED` backlog cannot starve a current invoice.

Repeated button presses are safe because leases, transaction uniqueness,
attempt uniqueness, and payment confirmation are idempotent.

## 19. Telegram UX Plan

### Payment option label

Use:

```text
Binance Pay (Binance-to-Binance)
```

Do not label it as BEP20, BSC, wallet address, or blockchain transfer.

### Invoice instructions

The message must state clearly:

- transfer from the Binance app/account;
- choose Binance Pay/internal transfer;
- do not choose the BSC/BEP20 network;
- send to the displayed Binance ID;
- send the exact displayed USDT amount;
- complete the transfer before the deadline;
- open Payment Details after payment;
- submit the displayed Order ID;
- keep the Payment Details page until confirmation succeeds.

### Buttons

Recommended actions:

```text
Salin Binance ID
Salin nominal
Saya sudah transfer
Refresh pembayaran
Lihat pesanan
Batalkan
Kembali ke katalog
```

The customer may also type the Order ID as a fallback while the bot is in
`AWAITING_BINANCE_ORDER_ID`.

### Customer-facing status copy

Provide distinct messages for:

```text
waiting for transfer
waiting for Order ID
checking Binance history
payment not found yet
payment found and being processed
session requires operator login
amount/recipient mismatch
invoice expired
payment confirmed
```

Do not expose cookies, endpoint paths, provider payloads, database identifiers,
or raw upstream errors to the customer.

## 20. Admin UI Plan

Follow the existing route-separation rules.

### Provider settings

Keep recipient and verifier readiness at:

```text
/admin/payment-settings/binance
```

This page should summarize:

- payment method enabled/disabled state;
- configured recipient Binance ID;
- selected verifier mode;
- official API readiness;
- web-session readiness;
- link to session management;
- link to the Binance payment ledger.

### Session management

Create a dedicated route:

```text
/admin/payment-settings/binance-web
```

It owns only web-session lifecycle operations:

- upload encrypted cookie JSON;
- validate now;
- select as primary after validation;
- revoke;
- show safe fingerprint and account binding;
- show last validation/poll timestamps;
- show stable error code and operator guidance.

All destructive/security-sensitive actions require a confirmation dialog,
disable while submitting, and show a processing state.

### Ledger

Retain:

```text
/admin/payments/binance
```

Extend it with:

- verifier source;
- session label/fingerprint;
- invoice and order;
- submitted Order ID;
- provider transaction ID;
- provider Order ID;
- exact amount and currency;
- direction and provider status;
- provider transaction time;
- match/confirmation status;
- safe failure reason;
- authenticated recheck action.

The recheck action polls and matches evidence. It is not a manual `mark paid`
button.

### Stable route outcomes

POST routes return to the originating dedicated page with stable codes such as:

```text
binance_web_session_created
binance_web_session_validated
binance_web_session_revoked
binance_web_session_unauthorized
binance_web_session_challenge
binance_web_account_mismatch
binance_web_contract_unknown
binance_web_recheck_complete
```

Do not collapse all of these into one generic configuration error.

## 21. Server Modules and Routes

Proposed new server modules:

```text
src/server/payment/binance-web-cookie.ts
src/server/payment/binance-web-contract.ts
src/server/payment/binance-web-poller.ts
src/server/payment/binance-web-session.ts
src/server/payment/binance-web-worker.ts
src/server/payment/binance-web-matching.ts
src/server/payment/binance-web-refresh.ts
```

Existing modules to extend:

```text
src/server/payment/binance-internal.ts
src/server/payment/binance-internal-setting.ts
src/server/payment/binance-internal-policy.ts
src/server/checkout/create-order.ts
src/server/payment/confirm-payment.ts
src/server/payment/expire-orders.ts
src/server/payment/cancel-order.ts
src/server/telegram/flow.ts
src/server/telegram/flows/payment/binance-internal.ts
src/server/telegram/flows/payment/binance-internal-presentation.ts
src/server/admin/binance-internal-ledger.ts
```

Proposed admin routes/components:

```text
src/app/admin/payment-settings/binance-web/page.tsx
src/app/api/admin/payment-settings/binance-web/route.ts
src/app/api/admin/payment-settings/binance-web/[id]/validate/route.ts
src/app/api/admin/payment-settings/binance-web/[id]/activate/route.ts
src/app/api/admin/payment-settings/binance-web/[id]/revoke/route.ts
src/components/admin/binance-web-session-create-form.tsx
src/components/admin/binance-web-session-list.tsx
```

Proposed cron routes:

```text
src/app/api/cron/payments/binance-web/route.ts
src/app/api/cron/payments/binance-web/match/route.ts
```

The existing official API cron route remains:

```text
src/app/api/cron/payments/binance-internal/route.ts
```

The final implementation may dispatch both verifier strategies from one shared
attempt orchestrator, but network polling and evidence parsing remain isolated
so one private endpoint failure does not consume the other verifier's route
budget.

## 22. Environment Configuration

Add placeholders only to `.env.example` and `.env.docker.example`:

```env
BINANCE_WEB_SESSION_CHECKOUT_ENABLED="false"
BINANCE_WEB_SESSION_AUTO_CONFIRM="false"
BINANCE_WEB_SESSION_POLL_TIMEOUT_MS="12000"
BINANCE_WEB_SESSION_MAX_LOOKBACK_HOURS="24"
BINANCE_WEB_SESSION_MAX_PAGES_PER_RUN="3"
BINANCE_WEB_SESSION_MAX_DETAIL_CALLS_PER_RUN="10"
```

Existing values remain optional:

```env
BINANCE_API_KEY=""
BINANCE_API_SECRET=""
BINANCE_API_BASE_URL="https://api.binance.com"
```

Recommended gate semantics:

| Gate | Effect |
| --- | --- |
| `CHECKOUT_ENABLED=false` | No new web-session invoice can be created |
| `CHECKOUT_ENABLED=true`, `AUTO_CONFIRM=false` | New controlled invoice/evidence collection only |
| `AUTO_CONFIRM=true` | A fully matched transaction may call normal confirmation |

The method is ready for new checkout only when all are true:

- the central Binance method switch is enabled;
- the recipient Binance ID is configured;
- the selected verifier is ready;
- an active validated matching web session exists, or the selected official API
  verifier is configured;
- the relevant checkout feature gate is enabled.

## 23. Cron and Scheduling

After read-only validation, add bounded scheduler loops for:

```text
/api/cron/payments/binance-web
/api/cron/payments/binance-web/match
```

Recommended initial interval: 30 seconds each.

Keep polling and matching as separate authenticated routes so slow Binance
network calls do not consume confirmation work. Both routes require
`Authorization: Bearer APP_CRON_SECRET` and must return bounded summaries only.

Example poll summary:

```json
{
  "sessions": 1,
  "leased": 1,
  "pages": 2,
  "received": 3,
  "unauthorized": 0,
  "rateLimited": 0,
  "challenged": 0,
  "contractUnknown": 0,
  "accountMismatch": 0,
  "errors": 0
}
```

Example match summary:

```json
{
  "scanned": 3,
  "matched": 1,
  "unmatched": 2,
  "ambiguous": 0,
  "confirmed": 0,
  "rejected": 0,
  "errors": 0,
  "autoConfirmEnabled": false
}
```

Summaries must not contain cookies, names, Order IDs, transaction IDs, account
IDs, or raw upstream messages.

## 24. Test Plan

### 24.1 Pure contract/parser tests

- valid history response;
- valid empty history response;
- valid detail response;
- invalid success envelope;
- non-array transaction list;
- invalid `hasMore`;
- missing timestamp;
- unsafe/overlong ID;
- string versus numeric amount representation;
- exact six-decimal parsing;
- non-zero precision after six decimals;
- incoming versus outgoing direction;
- completed versus pending/failed/refunded status;
- USDT versus another currency;
- repeated timestamp pagination;
- pagination loop;
- stable canonical raw-row hash;
- unknown contract fails closed.

### 24.2 Cookie/session tests

- accepted Binance domain;
- rejected lookalike domain;
- host-only cookie handling;
- path handling;
- secure cookie handling;
- expired cookie removal;
- duplicate cookie rejection;
- unsafe header character rejection;
- maximum count and size limits;
- AES-GCM encrypt/decrypt round trip;
- wrong-key/tampered-tag failure;
- stable cookie fingerprint;
- ciphertext absent from view models;
- revoke scrubs credentials and lease;
- concurrent lease claim;
- expired lease recovery;
- account identity change;
- session rotation.

### 24.3 HTTP poller tests

- expected method, URL, headers, and body;
- no automatic redirect;
- timeout;
- 401/403 unauthorized;
- 429 rate limit;
- 3xx challenge;
- HTML challenge;
- invalid JSON;
- response size cap;
- 5xx upstream error;
- network error;
- bounded pages;
- bounded detail calls;
- detail call only for relevant candidate;
- no secret in returned error detail.

### 24.4 Matching tests

- exact account/amount/currency/direction/status/time/Order ID match;
- amount mismatch;
- currency mismatch;
- outgoing transaction;
- incomplete transaction;
- wrong recipient/account;
- before invoice window;
- after invoice window;
- invoice timestamp expired but expiry worker not yet run;
- terminal order/payment;
- numeric Order ID alias;
- `M_P_` Order ID alias;
- duplicate provider transaction;
- duplicate submitted Order ID;
- one transaction claiming two invoices;
- two transactions targeting one invoice;
- two same-amount transactions in one window;
- two transactions at the same second;
- ambiguous candidate fails closed;
- repeated match is idempotent;
- matched confirmation retry;
- auto-confirm disabled/enabled gates;
- web-session and official-API evidence remain distinguishable.

### 24.5 Database concurrency tests

Use an isolated disposable PostgreSQL database to verify:

- concurrent unique micro-USDT allocation;
- concurrent Order ID alias submission;
- concurrent provider transaction claim;
- cron and buyer refresh overlap;
- two application workers processing the same page;
- session lease expiration/reclaim;
- payment confirmation exactly once;
- no duplicate stock assignment;
- no duplicate `SentDelivery` receipt;
- no refund from verifier/session failures.

### 24.6 Telegram/admin tests

- Binance Pay label is distinct from BEP20;
- internal instructions never request a transaction hash;
- BEP20 instructions never request a Binance Order ID;
- copy buttons use raw destination and raw amount;
- Order ID text fallback works;
- refresh targets the selected order;
- expired order cannot refresh into fulfillment;
- admin session pages require authentication;
- POST routes enforce origin/CSRF policy;
- raw cookies are absent from HTML and responses;
- revoke/activate actions use confirmation and processing states;
- ledger exposes evidence source but not secrets;
- stable error codes render distinct operator guidance.

### 24.7 Regression suite

Run the complete existing project validation:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npx.cmd --no-install prisma validate
npm.cmd run build
```

Also build both Linux Docker targets and apply every migration from zero to a
disposable PostgreSQL database. Do not run integration or destructive commands
against production.

## 25. Implementation Phases

### Phase 0: sanitized contract capture

Deliverables:

- sanitized history success fixture;
- sanitized empty fixture;
- sanitized detail fixture;
- sanitized unauthorized/challenge behavior;
- documented accepted status/direction values;
- documented account-binding field;
- documented amount precision;
- no cookies or personal identifiers in fixtures.

Exit criteria:

- Gates A through F have answers;
- automatic confirmation remains disabled.

### Phase 1: parser and cookie vault

Deliverables:

- cookie validation/encryption module;
- history/detail contract parser;
- pure unit tests;
- no database or production changes yet.

Exit criteria:

- parser rejects all unknown/malformed fixtures fail closed;
- no secret-bearing values appear in errors.

### Phase 2: additive schema and session admin

Deliverables:

- Prisma models/enums/indexes/constraints;
- additive migration;
- session create/validate/revoke/select service;
- dedicated admin session page;
- disposable database migration validation.

Exit criteria:

- all migrations apply from zero;
- revoke scrubs credentials;
- session views expose only safe metadata.

### Phase 3: read-only polling and ledger

Deliverables:

- HTTP poller;
- database lease worker;
- normalized transaction persistence;
- Binance ledger integration;
- authenticated poll cron;
- polling feature disabled by default.

Exit criteria:

- one session can be validated without an order;
- repeated polling persists no duplicates;
- challenge, unauthorized, and contract changes are visible but non-financial.

### Phase 4: matcher without auto-confirm

Deliverables:

- exact matcher;
- atomic evidence binding;
- targeted buyer/admin refresh;
- match cron;
- `AUTO_CONFIRM=false` observation mode.

Exit criteria:

- synthetic and disposable-DB concurrency tests pass;
- a controlled real transaction becomes `MATCHED` but does not alter payment.

### Phase 5: controlled confirmation test

Deliverables:

- new small-value invoice created after the session snapshot exists;
- exact internal Binance transfer;
- buyer-submitted Payment Details Order ID;
- observed `MATCHED -> VERIFIED -> CONFIRMED` flow;
- one payment transition;
- one stock allocation;
- one credential delivery;
- successful repeated-refresh idempotency test.

Exit criteria:

- recipient, account fingerprint, direction, status, currency, amount, Order ID,
  and time all match;
- no ambiguity, duplicate delivery, or refund;
- delivery and worker audit is clean.

### Phase 6: normal availability

Deliverables:

- web-session checkout gate enabled;
- auto-confirm enabled only after Phase 5;
- routine polling and matching scheduled;
- customer-facing method visible;
- operational alerts active.

Exit criteria:

- several scheduler intervals complete without errors;
- checkout, payment, fulfillment, and public health remain healthy.

## 26. Production Deployment Runbook

This feature changes payment, order, and customer fulfillment behavior. Global
checkout maintenance is mandatory before deployment or a controlled real test.

### Pre-deployment

1. Confirm current production maintenance state through the authenticated admin
   surface; do not assume the historical state is still current.
2. Enable global checkout maintenance.
3. Stop scheduler and notification worker when beginning the migration/app
   replacement window.
4. Complete the full local validation suite.
5. Build and smoke-test app and migrator Docker images.
6. Apply all migrations to an isolated disposable PostgreSQL instance.
7. Create a production PostgreSQL custom-format backup.
8. Verify backup size and SHA-256.
9. Tag the current app and migrator images with dated rollback tags.
10. Save, transfer, and checksum-verify candidate images.

### Deployment

1. Load candidate images on the VPS.
2. Run only `docker compose run --rm migrate` for the reviewed additive
   migration.
3. Never run `prisma migrate reset`, `db push --force-reset`, destructive SQL,
   `docker compose down -v`, or volume recreation.
4. Recreate only services whose image or service definition changed.
5. Preserve `telegram_store_postgres` and Caddy data volumes.
6. Keep all Binance web-session feature gates false for the foundation deploy.

### Foundation verification

- database health is `ready`;
- app, database, scheduler, and notification worker are healthy;
- app restart count is zero after stabilization;
- migration status has no pending migration;
- unauthenticated cron/webhook requests remain 401;
- no new Prisma, worker, payment, delivery, or refund errors;
- notification outbox and delivery ambiguity metrics do not regress;
- existing Shopee, DANA, Jago, wallet, official Binance, and BEP20 paths remain
  unchanged.

### Read-only session validation

1. Upload the Binance cookie export through the authenticated admin page.
2. Validate account identity.
3. Enable polling only.
4. Keep checkout and auto-confirm disabled.
5. Run a bounded poll.
6. Verify safe summaries and normalized ledger rows.
7. Run the same poll again and confirm zero duplicate inserts.
8. Inspect logs for secrets using safe pattern-based checks without printing the
   secrets themselves.

### Controlled payment verification

1. Keep global maintenance enabled except for the explicitly controlled test
   window.
2. Enable web-session checkout with auto-confirm off.
3. Create exactly one new small-value invoice.
4. Transfer the exact amount internally through Binance.
5. Submit the Payment Details Order ID.
6. Run targeted refresh and verify a single `MATCHED` evidence binding.
7. Enable auto-confirm for the controlled attempt only through the reviewed
   gate procedure.
8. Verify payment, order, stock, outbox, file receipt, guide, and completion.
9. Re-run refresh and cron to prove no duplicate action.
10. Audit for ambiguity, delivery failure, unexpected refund, and secret output.

### Checkout reopening

Disable maintenance only after:

- affected-data audit is clean;
- worker reconciliation is complete;
- public and internal health checks pass;
- the payment ledger shows one correct claim;
- outbox and delivery receipt state is safe;
- no new refund or fulfillment error is present;
- the operator has explicitly verified that new checkout is safe.

## 27. Rollback Plan

### Fast feature rollback

Set:

```env
BINANCE_WEB_SESSION_CHECKOUT_ENABLED="false"
BINANCE_WEB_SESSION_AUTO_CONFIRM="false"
```

Then recreate only the services necessary to consume the updated environment.
This prevents new web-session invoices and new automatic confirmations while
retaining evidence for audit.

### Session containment

If the session is compromised, challenged, or bound to the wrong account:

- enable maintenance;
- revoke the session through the authenticated admin route;
- stop Binance web polling;
- preserve normalized evidence and audit metadata;
- do not delete transactional rows;
- review every active snapshotted Binance attempt before reopening checkout.

### Application rollback

- restore the dated prior app image;
- restore the prior migrator image only if needed for normal deployment
  consistency;
- keep additive tables/columns in place;
- do not attempt a destructive down migration during incident response;
- verify existing providers, workers, health, and delivery after rollback.

An application rollback does not justify restoring the production database from
backup unless a separately authorized data-recovery incident requires it.

## 28. Monitoring and Alerts

Add safe aggregate monitoring for:

- active web sessions;
- last successful poll age;
- unauthorized sessions;
- challenged sessions;
- rate-limit count;
- contract-unknown count;
- account mismatch count;
- received/matched/unmatched/ambiguous/rejected transactions;
- matched attempts awaiting confirmation;
- confirmation errors;
- expired Binance attempts;
- payment confirmations without a bound evidence row, which must remain zero;
- delivery failures/ambiguity/refunds following a Binance confirmation.

Alert conditions should include:

- active session has not polled successfully within the expected threshold;
- unauthorized or challenge state persists;
- account identity changes;
- contract-unknown occurs;
- any ambiguity occurs on an active invoice;
- repeated confirmation errors;
- any duplicate-claim constraint violation;
- any automatic refund follows a verifier/session failure.

Monitoring output must remain aggregate and must not include sensitive IDs or
raw upstream payloads.

## 29. Known Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Private endpoint changes | Poller stops parsing | Strict contract parser, contract alert, checkout gate |
| Session expires | Payments cannot be observed temporarily | Session health, targeted operator warning, fail pending |
| CAPTCHA/anti-bot | Polling blocked | Conservative interval, challenge classification, no aggressive retry |
| New server IP verification | Session cannot be used from VPS | Read-only production-region validation before checkout |
| Cookie compromise | Binance account risk | AES-GCM vault, clean browser profile, revoke flow, no logs |
| Account binding not provable | Wrong recipient could be trusted | Auto-confirm remains disabled |
| Amount precision differs | False mismatch or customer error | Controlled precision gate before activation |
| Same-second transactions | Timestamp ambiguity | Provider ID + Order ID + exact amount, never time alone |
| Duplicate cron/refresh | Double claim or delivery | Leases, unique indexes, locks, idempotent confirmation |
| Historical unmatched backlog | New payments starved | Newest-first processing and targeted refresh |
| Upstream outage | Customer payment remains pending | Pending-provider state, no automatic rejection/refund |
| Binance policy/TOS changes | Integration becomes unusable | Feature flag, official API fallback, reversible provider visibility |

## 30. Out of Scope for Version 1

- extracting cookies silently from a local browser profile;
- storing credentials in source or environment files;
- bypassing Binance authentication, CAPTCHA, 2FA, or device approval;
- amount-only confirmation without an Order ID;
- Binance Android notification confirmation;
- customer-uploaded screenshot verification;
- manual admin `mark paid` bypass;
- automatically replacing BEP20 invoices with Binance Pay;
- changing or removing the existing BEP20 verifier;
- using BuildWithReys Market data or services;
- destructive production database migration or reset.

## 31. Definition of Done

The feature is complete only when all conditions below are true:

- `BINANCE_INTERNAL` clearly means Binance-to-Binance internal payment;
- `USDT_BEP20` remains distinct and operational;
- API key and API secret are not required for the web-session path;
- cookies are uploaded through authenticated admin UI and encrypted at rest;
- revocation scrubs stored credential ciphertext;
- the session is bound to a proven recipient/account identity;
- history and detail contracts are represented by sanitized fixtures;
- unknown Binance responses fail closed;
- exact amounts use integer micro-USDT comparisons;
- only received, completed USDT transactions are eligible;
- buyer-submitted Order ID is verified against provider evidence;
- one provider transaction can claim only one invoice;
- concurrent and same-second payments are handled safely;
- ambiguity never auto-confirms;
- expiry and terminal-order rules are revalidated transactionally;
- routine polling and targeted refresh are idempotent;
- official API and web-session evidence remain auditable and distinguishable;
- manual payment bypass remains unavailable;
- verifier errors cannot refund an order;
- payment confirmation invokes the existing confirmation path;
- stock and delivery remain exactly-once;
- all unit, route, integration, concurrency, type, lint, Prisma, build, Docker,
  and disposable-database checks pass;
- one controlled real Binance-to-Binance payment completes exactly once;
- production health, workers, ledger, outbox, and delivery audit are clean;
- maintenance is disabled only after checkout safety is explicitly verified.

## 32. Planned Work Order

The recommended implementation order is:

1. capture and sanitize the exact Binance history/detail contracts;
2. prove session account binding and amount precision;
3. implement cookie validation and encryption;
4. implement pure history/detail parsers;
5. add additive schema and migration;
6. implement session lifecycle and admin page;
7. implement read-only poller, lease worker, and ledger;
8. implement exact Order-ID-based matcher;
9. integrate targeted Telegram/admin refresh;
10. integrate confirmation behind disabled gates;
11. complete unit, route, database, and concurrency tests;
12. validate Docker and disposable migrations;
13. deploy the disabled foundation under maintenance;
14. validate a real session read-only in the production region;
15. run one controlled small-value payment with auto-confirm off;
16. enable controlled confirmation and prove exactly-once delivery;
17. complete the production audit;
18. open the method for normal checkout only after explicit verification.

## 33. Implementation Checkpoint (2026-09-08)

The local foundation described by this plan is now implemented but has not been
deployed or activated in production.

Implemented locally:

- additive Prisma migration `20260908103000_add_binance_web_sessions`;
- encrypted Binance cookie parser/vault using `PAYMENT_SESSION_ENCRYPTION_KEY`;
- fixed private history/detail/account-identity endpoint definitions;
- bounded history pagination, detail lookup, response-size limits, and challenge
  classification;
- normalized web transaction evidence with account-scoped uniqueness;
- session lifecycle services, validation/activation/revocation admin routes, and
  safe metadata-only session views;
- web-session polling and matching cron routes;
- exact Order ID alias, amount, recipient, status, direction, currency, account,
  and invoice-window checks;
- separate web evidence ledger under the existing Binance payments surface;
- verifier-mode snapshots on new Binance internal invoices;
- web-session-aware confirmation through the existing payment/fulfillment path;
- Telegram wording that distinguishes Binance-to-Binance from BEP20;
- feature gates defaulting to `false`.

Validation completed at this checkpoint:

```text
Focused Binance/web tests : passed
Full unit/route suite      : 786 passed, 43 skipped
TypeScript                 : passed
ESLint                     : passed
Prisma validate            : passed
Disposable PostgreSQL      : all 45 migrations applied
Provider DB concurrency   : 9 passed
Linux app image            : sha256:9b914b0ffa876c8b7970fe7de5f2353a6954f56fc79b3d7fc7afa74bba0c8daa
Linux migrator image       : sha256:8dfa28044eee7828e0272831add7e880f082c1893f144a49c4da44013760693e
Disposable runtime         : database ready; app healthy; restart 0
Route smoke                : poll 401; match 401; admin 307 without auth
Production deployment      : not performed
Production database        : not inspected or mutated
Real Binance cookie        : not entered or stored
```

Remaining before activation:

1. Enter the cookie only through the authenticated admin page.
2. Validate the actual account-identity and history/detail contracts from the
   production-region server.
3. Keep checkout and auto-confirm disabled while inspecting the ledger.
4. Run one controlled small-value Binance-to-Binance payment.
5. Prove exact recipient, identity, amount, Order ID, status, timestamp, one-time
   confirmation, and one-time delivery.
6. Perform the maintenance/backup/rollback production runbook before any
   migration or feature-gate change.
