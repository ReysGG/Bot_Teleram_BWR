import { TelegramApiError } from "@/server/telegram/api";

export const BROADCAST_NOTIFICATION_KINDS = [
  "ADMIN_BROADCAST",
  "PRODUCT_ANNOUNCEMENT",
  "PRODUCT_RESTOCK",
  "PRODUCT_SOLD_OUT",
  "REENGAGEMENT",
] as const;

const BROADCAST_NOTIFICATION_KIND_SET = new Set<string>(
  BROADCAST_NOTIFICATION_KINDS,
);

const PERMANENT_BAD_REQUEST_MESSAGES = [
  "chat not found",
  "user not found",
  "bot was kicked",
  "bot is not a member",
  "have no rights to send a message",
  "not enough rights to send text messages",
  "group chat was upgraded",
];

export function isBroadcastNotificationKind(kind: string) {
  return BROADCAST_NOTIFICATION_KIND_SET.has(kind);
}

export function isPermanentTelegramRecipientError(error: unknown) {
  if (!(error instanceof TelegramApiError) || !error.responseReceived) {
    return false;
  }
  if (error.statusCode === 403) return true;
  if (error.statusCode !== 400) return false;

  const message = error.message.toLowerCase();
  return PERMANENT_BAD_REQUEST_MESSAGES.some((fragment) =>
    message.includes(fragment),
  );
}

export function shouldSuppressFutureBroadcasts(input: {
  kind: string;
  error: unknown;
}) {
  return (
    isBroadcastNotificationKind(input.kind) &&
    isPermanentTelegramRecipientError(input.error)
  );
}
