import { deleteMessage, sendDocument } from "./api";

export async function deliverInvoiceDocument(input: Parameters<typeof sendDocument>[0] & { invoiceMessageId?: number | null }) {
  const { invoiceMessageId, ...document } = input;
  const sent = await sendDocument(document);
  if (invoiceMessageId && invoiceMessageId !== sent.message_id) {
    // Editing an old invoice into a document leaves the credential at the
    // invoice's original position in chat, so buyers can easily miss it. Send
    // the credential once at the current position, then remove the obsolete
    // invoice. A failed cleanup is harmless: it can leave an old invoice, but
    // it never causes a second credential upload.
    await deleteMessage(input.chatId, invoiceMessageId).catch(() => undefined);
  }
  return sent;
}
