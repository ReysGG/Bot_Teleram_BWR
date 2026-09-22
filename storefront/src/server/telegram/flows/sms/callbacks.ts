import { prisma } from "@/server/db/prisma";
import {
  purchaseSmsPoolBulkForCustomer,
  purchaseSmsPoolForCustomer,
} from "@/server/smspool/customer-orders";
import {
  showSmsCountries,
  showSmsCountryQuickPick,
  showSmsCountrySearchPrompt,
  showSmsSearchPrompt,
  showSmsSearchResults,
  showSmsServices,
} from "./search";
import { showSmsPurchaseConfirmation, showSmsQuote } from "./purchase";
import {
  cancelAllSmsOrders,
  cancelSmsOrder,
  showSmsCancelAllConfirmation,
  showSmsCancelConfirmation,
  showSmsCustomerOrder,
  showSmsOrderHistory,
  showSmsOrders,
} from "./orders";
import type { SmsFlowDependencies, SmsTelegramUser } from "./types";

export type SmsCallbackInput = {
  id: string;
  data: string;
  user: SmsTelegramUser;
  chatId: string;
  messageId: number;
};

export async function handleSmsCallback(
  deps: SmsFlowDependencies,
  callback: SmsCallbackInput,
): Promise<boolean> {
  if (!callback.data.startsWith("sms_")) return false;
  const { chatId, messageId } = callback;
  const render = deps.renderNavigationMessage;

  if (callback.data.startsWith("sms_services:")) {
    const page = Number.parseInt(callback.data.slice("sms_services:".length), 10) || 1;
    if (page === 1) await deps.beginNewNavigationBubble(chatId);
    await showSmsServices(render, chatId, page === 1 ? undefined : messageId, page);
  } else if (callback.data === "sms_search") {
    await showSmsSearchPrompt(render, chatId, messageId);
  } else if (callback.data.startsWith("sms_search_page:")) {
    const session = await prisma.botSession.findUnique({ where: { chatId } });
    if (!session?.smsSearchQuery) {
      await showSmsSearchPrompt(render, chatId, messageId);
    } else {
      await showSmsSearchResults(
        render,
        chatId,
        session.smsSearchQuery,
        messageId,
        Number.parseInt(callback.data.slice("sms_search_page:".length), 10) || 1,
      );
    }
  } else if (callback.data.startsWith("sms_quick:")) {
    await showSmsCountryQuickPick(
      render,
      chatId,
      Number.parseInt(callback.data.slice("sms_quick:".length), 10),
      messageId,
    );
  } else if (callback.data.startsWith("sms_countries:")) {
    const [serviceId, page, category] = callback.data.slice("sms_countries:".length).split(":");
    await showSmsCountries(
      render,
      chatId,
      Number.parseInt(serviceId, 10),
      messageId,
      Number.parseInt(page, 10) || 1,
      category === "success" ? "success" : "cheap",
    );
  } else if (callback.data.startsWith("sms_country_search:")) {
    const [serviceId, category] = callback.data.slice("sms_country_search:".length).split(":");
    await showSmsCountrySearchPrompt(
      render,
      chatId,
      Number.parseInt(serviceId, 10),
      category === "success" ? "success" : "cheap",
      messageId,
    );
  } else if (callback.data.startsWith("sms_country_search_page:")) {
    const [serviceId, page, category] = callback.data.slice("sms_country_search_page:".length).split(":");
    const session = await prisma.botSession.findUnique({ where: { chatId } });
    await showSmsCountries(
      render,
      chatId,
      Number.parseInt(serviceId, 10),
      messageId,
      Number.parseInt(page, 10) || 1,
      category === "success" ? "success" : "cheap",
      session?.smsSearchQuery,
    );
  } else if (callback.data.startsWith("sms_country_term:")) {
    const [serviceId, category, term] = callback.data.slice("sms_country_term:".length).split(":");
    await prisma.botSession.updateMany({ where: { chatId }, data: { smsSearchQuery: term } });
    await showSmsCountries(
      render,
      chatId,
      Number.parseInt(serviceId, 10),
      messageId,
      1,
      category === "success" ? "success" : "cheap",
      term,
    );
  } else if (callback.data.startsWith("sms_country:")) {
    const [serviceId, countryId] = callback.data.slice("sms_country:".length).split(":");
    await showSmsQuote(
      render,
      chatId,
      Number.parseInt(serviceId, 10),
      Number.parseInt(countryId, 10),
      callback.user,
      messageId,
    );
  } else if (callback.data.startsWith("sms_quote:")) {
    const [serviceId] = callback.data.slice("sms_quote:".length).split(":");
    await showSmsCountryQuickPick(render, chatId, Number.parseInt(serviceId, 10), messageId);
  } else if (callback.data.startsWith("sms_confirm:")) {
    const [serviceId, countryId, quantity] = callback.data.slice("sms_confirm:".length).split(":");
    await showSmsPurchaseConfirmation(
      render,
      chatId,
      Number.parseInt(serviceId, 10),
      Number.parseInt(countryId, 10),
      Number.parseInt(quantity, 10),
      messageId,
    );
  } else if (callback.data.startsWith("sms_buy:")) {
    const [serviceId, countryId] = callback.data.slice("sms_buy:".length).split(":");
    await showSmsPurchaseConfirmation(
      render,
      chatId,
      Number.parseInt(serviceId, 10),
      Number.parseInt(countryId, 10),
      1,
      messageId,
    );
  } else if (callback.data.startsWith("sms_buy_bulk:")) {
    const [serviceId, countryId, quantity] = callback.data.slice("sms_buy_bulk:".length).split(":");
    await showSmsPurchaseConfirmation(
      render,
      chatId,
      Number.parseInt(serviceId, 10),
      Number.parseInt(countryId, 10),
      Number.parseInt(quantity, 10),
      messageId,
    );
  } else if (callback.data.startsWith("sms_purchase:")) {
    const [serviceId, countryId] = callback.data.slice("sms_purchase:".length).split(":");
    const order = await purchaseSmsPoolForCustomer({
      chatId,
      serviceId: Number.parseInt(serviceId, 10),
      countryId: Number.parseInt(countryId, 10),
      idempotencyKey: `telegram-sms:${callback.id}`,
      buyer: callback.user,
    });
    await showSmsCustomerOrder(render, chatId, order.id, messageId);
  } else if (callback.data.startsWith("sms_purchase_bulk:")) {
    const [serviceId, countryId, quantity] = callback.data.slice("sms_purchase_bulk:".length).split(":");
    const result = await purchaseSmsPoolBulkForCustomer({
      chatId,
      serviceId: Number.parseInt(serviceId, 10),
      countryId: Number.parseInt(countryId, 10),
      quantity: Number.parseInt(quantity, 10),
      idempotencyKey: `telegram-sms-bulk:${callback.id}`,
      buyer: callback.user,
    });
    const notice = result.failedQuantity > 0
      ? `⚠️ ${result.orders.length}/${result.requestedQuantity} nomor berhasil dipesan. Nomor yang gagal tidak ditagihkan atau sudah direfund.`
      : `✅ ${result.orders.length} nomor berhasil dipesan. Semua nomor aktif tampil langsung di bawah.`;
    await showSmsOrders(render, chatId, messageId, notice, result.orders.map((order) => order.id));
  } else if (callback.data === "sms_orders") {
    await showSmsOrders(render, chatId, messageId);
  } else if (callback.data.startsWith("sms_history:")) {
    await showSmsOrderHistory(
      render,
      chatId,
      messageId,
      Number.parseInt(callback.data.slice("sms_history:".length), 10) || 1,
    );
  } else if (callback.data.startsWith("sms_refresh:")) {
    await showSmsCustomerOrder(render, chatId, callback.data.slice("sms_refresh:".length), messageId);
  } else if (callback.data === "sms_cancel_all_confirm") {
    const result = await cancelAllSmsOrders(chatId);
    const notice = result.total === 0
      ? "ℹ️ Tidak ada nomor SMS aktif."
      : `✅ ${result.cancelled} nomor dibatalkan dan direfund.${result.skipped > 0 ? ` ${result.skipped} nomor belum dapat dibatalkan.` : ""}`;
    await showSmsOrders(render, chatId, messageId, notice);
  } else if (callback.data === "sms_cancel_all") {
    await showSmsCancelAllConfirmation(render, chatId, messageId);
  } else if (callback.data.startsWith("sms_cancel_confirm:")) {
    const order = await cancelSmsOrder(chatId, callback.data.slice("sms_cancel_confirm:".length));
    await showSmsCustomerOrder(render, chatId, order.id, messageId);
  } else if (callback.data.startsWith("sms_cancel:")) {
    await showSmsCancelConfirmation(
      render,
      chatId,
      callback.data.slice("sms_cancel:".length),
      messageId,
    );
  } else if (callback.data.startsWith("sms_order:")) {
    await showSmsCustomerOrder(render, chatId, callback.data.slice("sms_order:".length), messageId);
  }
  return true;
}
