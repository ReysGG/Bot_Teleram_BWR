# Website success-channel announcements - 2026-09-16

Backend image: telegram-app:web-success-20260916
Image ID: sha256:3e1a980292d5280ea19cd0cc7f5aeedb7a4316e98b185f01adc0c3a3b9d5d394
Public channel: https://t.me/bwrtele_success
Website shown: BWR Tele / https://store.buildwithreys.com

## Behavior

- A paid Web order queues one SUCCESS_CHANNEL notification when its final product file is first downloaded and the order transitions to COMPLETED.
- All downloads for an order share the existing payment-transition lock, then use the per-receipt lock. Concurrent final downloads cannot miss completion or queue multiple announcements.
- Queue uses success-channel:order:ORDER_ID and only targets the configured public channel. No private Telegram messages, attachments or post-delivery guides are queued for the Web customer's synthetic chat ID.
- Download retries return the same stock and do not requeue the announcement. Existing completed orders are not backfilled.
- Worker rechecks Web payment/provider status, completion and every delivery receipt before publishing. Public Web messages omit buyer identity and never select credential contents.
- Dispatch marker survives worker crashes. Ambiguous sends and accepted-but-uncommitted results go to MANUAL_REVIEW; a definite safe retry such as Telegram 429 clears the marker. Do not blindly resend an uncertain announcement: review the channel first. An operator retry must not bypass this marker without explicit confirmation that the original was not posted.
- Digital purchase wording was refreshed for both Web and Telegram purchases. Web CTA points to the website; Telegram CTA stays on the bot. Includes thank-you, product, quantity and transaction total. Historical channel posts are unchanged.
- Optional STOREFRONT_PUBLIC_URL config accepts HTTPS without credentials, query or fragment; default is the production storefront. No production environment change was needed.

## Validation and rollout

- 930 root tests passed; TypeScript and lint passed.
- 32 focused tests passed on an isolated PostgreSQL database in the Freestyle build VM, including 3-unit concurrent/repeated downloads, single outbox entry, dispatch deduplication, rate-limit retry and privacy checks.
- All Telegram API sends in tests were mocked. Test containers were isolated from external networks and removed after completion.
- Runtime build ran on Freestyle; all image parts and the combined archive passed SHA-256 validation before transfer/loading.
- App-only Azure rollout completed. Config/environment unchanged; production DB container identity unchanged; scheduler and notification worker running.
- Website and backend public health returned 200. Read-only getChat/getMe/getChatMember checks verified channel title, username and can_post_messages=true.
- No test or fabricated purchase announcement was posted. No maintenance toggle, production migration, database backup or customer-data repair was performed.
- Private config rollback backup: /opt/telegram-store/backups/web-success-20260916-1789549332
- Rollback image tag: telegram-app:rollback-web-success-20260916
