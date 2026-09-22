import { z } from "zod";

const base = { expectedRevision: z.number().int().min(0).max(2_147_483_646), idempotencyKey: z.string().uuid() };
const productId = z.string().min(1).max(80);
const quantity = z.number().int().min(1).max(750);
export const webCartCommandSchema = z.discriminatedUnion("action", [
  z.object({ ...base, action: z.literal("add"), productId, quantity }).strict(),
  z.object({ ...base, action: z.literal("set"), productId, quantity }).strict(),
  z.object({ ...base, action: z.literal("remove"), productId }).strict(),
  z.object({ ...base, action: z.literal("clear") }).strict(),
]);
export type WebCartCommand = z.infer<typeof webCartCommandSchema>;
export class WebCartError extends Error {
  constructor(public readonly code: "cart_conflict" | "cart_key_conflict" | "cart_full" | "cart_quantity_invalid" | "cart_product_unavailable") { super(code); }
}
export const MAX_CART_PRODUCTS = 50;
