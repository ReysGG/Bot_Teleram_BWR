import {
  normalizeTelegramRichTextDocument,
  shiftTelegramRichTextEntities,
  type TelegramRichTextEntity,
} from "@/lib/telegram-rich-text";

type AdminMessageSnapshot = {
  version: 1;
  text: string;
  entities: TelegramRichTextEntity[];
};

export function serializeAdminMessageSnapshot(input: {
  text: string;
  entities: TelegramRichTextEntity[];
}) {
  return JSON.stringify({ version: 1, ...input } satisfies AdminMessageSnapshot);
}

export function parseAdminMessageSnapshot(value: string) {
  try {
    const parsed = JSON.parse(value) as Partial<AdminMessageSnapshot>;
    if (parsed.version !== 1 || typeof parsed.text !== "string") return null;
    return normalizeTelegramRichTextDocument({
      text: parsed.text,
      entities: parsed.entities ?? [],
      maxLength: 2_000,
    });
  } catch {
    try {
      return normalizeTelegramRichTextDocument({
        text: value,
        entities: [],
        maxLength: 2_000,
      });
    } catch {
      return null;
    }
  }
}

export function adminMessageTelegramDocument(input: {
  invoiceNumber: string;
  snapshot: { text: string; entities: TelegramRichTextEntity[] };
}) {
  const prefix = [
    "💬 Pesan dari admin BWR Tele",
    "",
    `🧾 Invoice: ${input.invoiceNumber}`,
    "",
  ].join("\n");
  const invoiceOffset = prefix.indexOf(input.invoiceNumber);
  return {
    text: `${prefix}${input.snapshot.text}`,
    entities: [
      { type: "bold" as const, offset: 3, length: "Pesan dari admin BWR Tele".length },
      ...(invoiceOffset >= 0
        ? [{ type: "code" as const, offset: invoiceOffset, length: input.invoiceNumber.length }]
        : []),
      ...shiftTelegramRichTextEntities(input.snapshot.entities, prefix.length),
    ],
  };
}
