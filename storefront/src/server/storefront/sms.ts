import { prisma } from "@/server/db/prisma";
import { booleanEnv } from "@/server/env";
import { getPaymentMethodAvailability } from "@/server/payment/method-availability";
import { getMaintenanceState } from "@/server/store/maintenance";
import { webCustomerChatId } from "./customer-access";
import { calculateSmsPoolSellPrice, getSmsPoolSuccessRates, smsPoolConfigured, smsPoolProviderPriceFloor, SMSPOOL_CANCEL_PENDING_MESSAGE, SMSPOOL_NO_NUMBERS_MESSAGE } from "@/server/smspool/client";
import { getCachedSmsPoolServices } from "@/server/smspool/service-catalog-cache";

export function webSmsEnabled() { return booleanEnv("STOREFRONT_SMS_ENABLED", false) && smsPoolConfigured(); }

export function webSmsFailure(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const known: Record<string, string> = {
    "Saldo wallet tidak mencukupi": "sms_insufficient_balance",
    "Order SMS tidak ditemukan": "sms_order_missing",
    "Order SMS ini tidak dapat dibatalkan": "sms_cancel_unavailable",
    [SMSPOOL_CANCEL_PENDING_MESSAGE]: "sms_cancel_pending",
    [SMSPOOL_NO_NUMBERS_MESSAGE]: "sms_no_numbers",
  };
  const codes = ["sms_account_required", "sms_request_conflict", "sms_price_changed", "sms_maintenance", "sms_wallet_disabled", "sms_order_missing", "sms_cursor_invalid"];
  return known[message] ?? (codes.includes(message) ? message : "sms_unavailable");
}

export async function webSmsCatalog(customerId: string, serviceId?: number) {
  const chatId = webCustomerChatId(customerId);
  const [wallet, methods, maintenance, services, rates] = await Promise.all([
    prisma.wallet.findUnique({ where: { chatId }, select: { balance: true } }),
    getPaymentMethodAvailability(), getMaintenanceState(), getCachedSmsPoolServices(),
    serviceId ? getSmsPoolSuccessRates(serviceId) : Promise.resolve([]),
  ]);
  return {
    balance: wallet?.balance ?? 0, walletEnabled: methods.walletCheckoutEnabled, maintenance: maintenance.enabled,
    services: services.map((service) => ({ id: service.ID, name: service.name })),
    countries: rates.map((country) => ({ id: country.country_id, name: country.name, code: country.short_name, price: calculateSmsPoolSellPrice(smsPoolProviderPriceFloor(country)), successRate: Math.min(100, country.success_rate) })),
  };
}

type SmsOrder = NonNullable<Awaited<ReturnType<typeof prisma.smsPoolCustomerOrder.findFirst>>>;
export function publicWebSmsOrder(order: SmsOrder) {
  return { id: order.id, serviceName: order.serviceName, countryName: order.countryName, countryCode: order.countryCode, price: order.sellPrice, status: order.status, phoneNumber: order.phoneNumber, otpCode: order.otpCode, fullCode: order.fullCode, createdAt: order.createdAt.toISOString(), expiresAt: order.expiresAt?.toISOString() ?? null, refundedAt: order.refundedAt?.toISOString() ?? null };
}
export async function webSmsOrders(customerId: string, cursor?: string) {
  const chatId = webCustomerChatId(customerId);
  if (cursor && !await prisma.smsPoolCustomerOrder.findFirst({ where: { id: cursor, chatId }, select: { id: true } })) throw new Error("sms_cursor_invalid");
  const rows = await prisma.smsPoolCustomerOrder.findMany({ where: { chatId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 21, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
  return { orders: rows.slice(0, 20).map(publicWebSmsOrder), nextCursor: rows.length > 20 ? rows[19].id : null };
}
export async function requireWebSmsOrder(customerId: string, orderId: string) {
  const order = await prisma.smsPoolCustomerOrder.findFirst({ where: { id: orderId, chatId: webCustomerChatId(customerId) } });
  if (!order) throw new Error("sms_order_missing");
  return order;
}
