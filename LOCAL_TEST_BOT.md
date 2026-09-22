# Local Telegram test bot

The local testing bot is deliberately separate from the production bot:

```text
Username : @BWRTeleLocalTestBot
Bot ID   : 8825381405
Webhook  : empty; local runner uses long polling
```

The production bot `@K12JsonStockBot` / `8875520688` is never used by the local
runner. The token is stored only in the ignored `.env.local.admin-seller` file.
The runner refuses to start unless all of these conditions pass:

- `LOCAL_TEST_BOT_CONFIRMED=true`;
- token exists and its numeric prefix is not `8875520688`;
- `getMe` matches `TELEGRAM_BOT_USERNAME`;
- `getWebhookInfo` reports an empty webhook.

Start the local stack with:

```powershell
docker compose -f docker-compose.local-admin-seller.yml --env-file .env.local.admin-seller --profile testing-bot up -d
```

Check the complete local fleet with:

```powershell
docker compose -f docker-compose.local-admin-seller.yml --env-file .env.local.admin-seller --profile testing-bot ps
```

The bot forwards updates only to the local backend webhook at
`http://app:3000/api/telegram/webhook`. It does not change any production
webhook or send production messages.
