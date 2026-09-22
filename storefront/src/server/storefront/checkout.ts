import type { CheckoutPaymentMethod } from "@/server/payment/method-availability";
import { createDigitalOrder } from "@/server/checkout/create-order";
import {
  createWebCustomerSession,
  getOrCreateWebCustomer,
  webCustomerChatId,
} from "@/server/storefront/customer-access";
import { getWebCustomerOrder, webCustomerWalletBalance } from "@/server/storefront/orders";

export async function createWebCheckout(input: {
  email: unknown;
  password: unknown;
  productId: string;
  quantity: number;
  paymentMethod: CheckoutPaymentMethod;
  idempotencyKey: string;
  userAgent?: string | null;
}) {
  const { customer, email } = await getOrCreateWebCustomer({
    email: input.email,
    password: input.password,
  });
  const order = await createDigitalOrder({
    chatId: webCustomerChatId(customer.id),
    channel: "WEB",
    webCustomerId: customer.id,
    buyerEmail: email,
    productId: input.productId,
    quantity: input.quantity,
    paymentMethod: input.paymentMethod,
    idempotencyKey: input.idempotencyKey,
  });
  const session = await createWebCustomerSession({
    customerId: customer.id,
    userAgent: input.userAgent,
  });
  const publicOrder = await getWebCustomerOrder(customer.id, order.invoiceNumber);
  if (!publicOrder) throw new Error("Created web order cannot be loaded");
  const walletBalance = await webCustomerWalletBalance(customer.id);
  return {
    customer: { contactMasked: customer.contactMasked, walletBalance },
    session,
    order: publicOrder,
  };
}
