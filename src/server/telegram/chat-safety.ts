export function isPrivateTelegramChatId(chatId: string) {
  return /^[1-9]\d*$/.test(chatId.trim());
}

const NON_PRIVATE_NOTIFICATION_KINDS = new Set([
  "SUCCESS_CHANNEL",
  "SYSTEM_ALERT",
]);

export function telegramNotificationPrivateChatBlockReason(input: {
  kind: string;
  chatId: string;
}) {
  if (NON_PRIVATE_NOTIFICATION_KINDS.has(input.kind)) return null;
  return isPrivateTelegramChatId(input.chatId)
    ? null
    : `Telegram ${input.kind} notification was blocked for a non-private chat`;
}
