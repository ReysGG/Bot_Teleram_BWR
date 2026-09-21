import { editMessageCaption, TelegramApiError } from "./api";

// Caption edits are repeatable. Never fall back to sending another credential
// or completion bubble if Telegram cannot edit the original delivery message.
export async function editCompletionCaption(input: Parameters<typeof editMessageCaption>[0]) {
  try {
    return await editMessageCaption(input);
  } catch (error) {
    if (error instanceof TelegramApiError && error.responseReceived &&
        error.statusCode === 400 && /message is not modified/i.test(error.message)) {
      return { message_id: input.messageId };
    }
    throw error;
  }
}
