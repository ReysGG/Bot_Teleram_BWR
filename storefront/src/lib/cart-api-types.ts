import type { StorefrontAvailability } from "./catalog-types";

export type CartItem = {
  id: string; slug: string; name: string; price: number; imageUrl: string | null;
  availability: StorefrontAvailability; quantity: number; canCheckout: boolean; maxQuantity: number;
};
export type CartSnapshot = { revision: number; items: CartItem[] };
export type CartAction =
  | { action: "add" | "set"; productId: string; quantity: number }
  | { action: "remove"; productId: string }
  | { action: "clear" };
export type CartCommand = CartAction & { expectedRevision: number; idempotencyKey: string };
