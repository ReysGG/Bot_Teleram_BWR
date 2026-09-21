# Telegram message layout release - 2026-09-16

## Azure build policy

Build and test Azure backend releases on the local workstation. Transfer the
finished Linux amd64 image to Azure, load it, and replace only the application.
Do not run builds on Azure (small VPS). Do not use Freestyle for this backend.
Keep production environment files on Azure and out of build contexts.

## Change

QRIS checkout sends one photo with invoice caption and order/cancel/catalog
buttons. It no longer sends a separate invoice acknowledgement.
After acknowledged digital delivery, the follow-up worker edits the original
file caption with the completion summary and controls. It never resends the
file when editing fails. Long instructions remain in the notification snapshot
and open only through an owner-bound full-guide button.
Existing historical messages are not rewritten or replayed.

## Validation

Local suite: 935 passed, 61 database/integration tests skipped by default.
TypeScript and ESLint passed. New worker tests cover caption edits, long guides,
already-applied edits, missing/ambiguous messages, and mismatched recipients.
Local Linux amd64 production image built successfully (Next.js compilation,
TypeScript, static generation and tracing). 50 focused tests passed in local
Docker with a disposable PostgreSQL and internal-only network; that database
and network were removed after testing. Image: telegram-app:message-layout-20260916.
Image ID: sha256:9671c3973fea2f4245d2e66ebd6634f8fcd82820002274a03a73ab79ed9b1fc5.
Archive checksum: 7cc2f725ec058dab63299a0fd0cc4d612a600f9322db93b25c6b3e3529e9331c.
No schema change or production database operation is required.

Azure Docker load reported a different image ID than the local archive config.
The archive SHA256, all root filesystem layer digests, OS/architecture and
runtime configuration were compared and matched before promotion. Azure loaded
ID: sha256:adf8c2aa1319d7fd82eb2662c5eacf4c788606e24600682e2b10f2d770424f21.

## Production acceptance

Deployed to Azure successfully. Candidate image active; app healthy; public
/api/health returned HTTP 200 with ok=true. Scheduler and notification worker
running; production environment hash and database container identity unchanged.
Private config backup: /opt/telegram-store/backups/message-layout-20260916-1789553843.
Rollback image: telegram-app:rollback-message-layout-20260916.
No maintenance toggle, migration, data repair or customer-message replay.
No real purchase was created or paid for validation.
