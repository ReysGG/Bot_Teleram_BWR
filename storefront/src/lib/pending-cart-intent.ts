import type { CartCommand } from "./cart-api-types";

const KEY = "bwr-cart-login-intent-v1";
const TTL = 60 * 60 * 1000;
export type PendingCartIntent = {
  id: string; productId: string; slug: string; quantity: number; createdAt: number;
  ownerId?: string; command?: CartCommand;
};
export function saveCartIntent(intent: PendingCartIntent): boolean {
  try { sessionStorage.setItem(KEY, JSON.stringify(intent)); return true; } catch { return false; }
}
export function readCartIntent(id: string, productId: string): PendingCartIntent | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as PendingCartIntent | null;
    if (!value || value.id !== id || value.productId !== productId ||
      !/^[0-9a-f-]{36}$/i.test(value.id) || typeof value.slug !== "string" ||
      !Number.isInteger(value.quantity) || value.quantity < 1 || value.quantity > 750 ||
      !Number.isFinite(value.createdAt) || Date.now() - value.createdAt > TTL || value.createdAt > Date.now() + 60_000) return null;
    if (value.command && (value.command.action !== "add" || value.command.productId !== productId ||
      value.command.quantity !== value.quantity || value.command.idempotencyKey !== id ||
      !Number.isInteger(value.command.expectedRevision) || value.command.expectedRevision < 0)) return null;
    return value;
  } catch { return null; }
}
export function clearCartIntent(id: string) {
  try {
    if (JSON.parse(sessionStorage.getItem(KEY) ?? "null")?.id === id) sessionStorage.removeItem(KEY);
  } catch { /* Unavailable storage cannot trigger an addition. */ }
}
export function beginCartIntent(product: { id: string; slug: string }, quantity = 1) {
  const intent: PendingCartIntent = { id: crypto.randomUUID(), productId: product.id, slug: product.slug, quantity, createdAt: Date.now() };
  const target = `/products/${encodeURIComponent(product.slug)}`;
  return saveCartIntent(intent) ? `${target}?cart_intent=${encodeURIComponent(intent.id)}` : target;
}
