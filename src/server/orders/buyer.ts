export type BuyerIdentity = {
  username?: string;
  firstName?: string;
  lastName?: string;
};

export function normalizeBuyerIdentity(input: BuyerIdentity): {
  buyerUsername: string | null;
  buyerDisplayName: string | null;
} {
  const buyerUsername = input.username?.trim().replace(/^@/, "").slice(0, 100) || null;
  const buyerDisplayName = [input.firstName?.trim(), input.lastName?.trim()]
    .filter(Boolean)
    .join(" ")
    .slice(0, 200) || null;
  return { buyerUsername, buyerDisplayName };
}

export function buyerLabel(input: {
  buyerUsername: string | null;
  buyerDisplayName: string | null;
  buyerEmail: string | null;
  chatId: string;
  channel?: string;
}): string {
  if (input.channel === "WEB" || input.chatId.startsWith("web:")) return input.buyerEmail || "Pelanggan Web";
  if (input.buyerUsername) return `@${input.buyerUsername}`;
  return input.buyerDisplayName || input.buyerEmail || `Telegram ${input.chatId}`;
}
