import { createClerkClient } from "@clerk/backend";
import { cache } from "react";

// Request-scoped lookup for authenticated admin views only. Do not rewrite orders.
const currentEmail = cache(async (issuer: string, userId: string): Promise<string | null> => {
  const secretKey = process.env.STOREFRONT_CLERK_SECRET_KEY?.trim();
  if (!secretKey || issuer !== process.env.STOREFRONT_CLERK_ISSUER?.trim()) return null;
  try {
    const user = await createClerkClient({ secretKey }).users.getUser(userId);
    if (user.id !== userId) return null;
    const email = user.emailAddresses.find(item => item.id === user.primaryEmailAddressId);
    return email?.verification?.status === "verified" ? email.emailAddress : null;
  } catch { return null; }
});

export async function withAdminWebBuyer<T extends {
  channel?: string; buyerEmail: string | null;
  webCustomer?: { contactMasked: string; clerkIssuer: string | null; clerkUserId: string | null } | null;
}>(order: T): Promise<T> {
  if (order.channel !== "WEB") return order;
  const customer = order.webCustomer;
  const email = customer?.clerkIssuer && customer.clerkUserId
    ? await currentEmail(customer.clerkIssuer, customer.clerkUserId) : null;
  return { ...order, buyerEmail: email ?? order.buyerEmail ?? customer?.contactMasked ?? null };
}

export const adminWebCustomerSelect = {
  select: { contactMasked: true, clerkIssuer: true, clerkUserId: true },
} as const;
