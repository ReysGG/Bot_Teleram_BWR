import { z } from "zod";

export const ratingInput = z.object({
  kind: z.enum(["product", "seller"]),
  orderItemId: z.string().min(1).max(100),
  stars: z.number().int().min(1).max(5),
  review: z.string().trim().max(2000).default(""),
}).strict();

export function ratingEligibility(input: {
  customerId: string;
  ownerId: string | null;
  orderStatus: string;
  paymentStatus: string;
  refunded: boolean;
  hasRefund: boolean;
  channel: string;
  receiptStatus: string | null;
  downloadCount: number;
}) {
  if (input.customerId !== input.ownerId) return "rating_order_missing";
  if (input.paymentStatus !== "PAID" || input.orderStatus !== "COMPLETED" || input.refunded || input.hasRefund) return "rating_order_ineligible";
  if (input.receiptStatus !== "SENT" || (input.channel === "WEB" && input.downloadCount < 1)) return "rating_delivery_pending";
  return null;
}
