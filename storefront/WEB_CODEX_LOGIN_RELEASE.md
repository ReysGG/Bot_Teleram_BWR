# Web Codex login retrieval - 2026-09-16

## Behavior

Paid Web customers download their original product from order details. The page
refreshes after that request, and the login retrieval card appears for delivered
K12 credentials with a valid email identity. It reports available/missing login
mappings and downloads the available rows as TXT on an explicit button click.
Partial retrieval offers the existing support destination. No Telegram account
link, JSON upload, new inventory allocation, or Telegram notification is involved.

## Ownership and storage

Both routes require the existing HMAC API authentication and customer session.
The proxy uses Clerk commerce authentication and enforces origin on POST.
Backend derives stock and email identity from delivered inventory in the owned
WEB order. Both payment records must be PAID and order must be FULFILLING or
COMPLETED. Each receipt must be WEB/SENT with the matching customer identity;
stock must be DELIVERED and assigned to that exact order/item.
The order transition lock serializes rechecks and download preparation.

No migration: AccountRedeemBatch/AccountRedeemEvent accept the existing opaque
web:<customerId> namespace. Download preparation writes only these audit rows;
stock, wallet and payment are untouched. SENT means response prepared, not proof
that a browser saved the file. Repeated download records another access to the
same login and does not claim a new account. No credentials are returned by GET.
Responses are private/no-store; no credentials appear in URLs or logs.

## Routes

- Backend: GET/POST /api/storefront/v1/orders/[invoice]/login
- Website: GET/POST /api/orders/[invoice]/login
- UI: order detail, after original product download

## Validation

935 root tests passed (62 opt-in tests skipped by default). A separate local
Docker run passed 51 focused tests with disposable PostgreSQL, including owner
isolation, unpaid/refunded denial, partial mappings, concurrent/repeated reads,
unchanged inventory and no Telegram notifications. Four UI tests passed for
visibility, partial retrieval, authentication error and refresh after download.
Root/frontend TypeScript and ESLint passed. Backend built locally for linux/amd64.
Azure receives only the finished image. Frontend uses its existing website VM.


## Azure acceptance

Image telegram-app:web-login-20260916 deployed from a locally built artifact.
Archive checksum: 18b5afaa475df3e617b8f0f8f4086722d29eca07c371d66e85d117bbc1272244.
Loaded image ID: sha256:e418770c4254453d16dd926f9e25d1563f3fdb1c269a611889cab11ba9d6102d.
App and public health passed; workers running; DB container and environment unchanged.
Unauthenticated new endpoint returns 401 before customer data access.
Private config backup: /opt/telegram-store/backups/web-login-20260916-1789555796.
No production migration, direct customer-data operation, or real credential download
was used in acceptance checks.

Frontend release 20260916-104928 is healthy on the existing storefront VM.
Public website /api/health returned 200/ok=true and anonymous login retrieval
returned 401. No real buyer credential was downloaded in production checks.
