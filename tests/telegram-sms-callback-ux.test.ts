import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
  render: vi.fn(),
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    smsPoolCustomerOrder: {
      findMany: mocks.findMany,
      count: mocks.count,
    },
  },
}));

vi.mock("@/server/smspool/customer-orders", () => ({
  cancelAllActiveSmsPoolCustomerOrders: vi.fn(),
  cancelSmsPoolCustomerOrder: vi.fn(),
  refreshSmsPoolCustomerOrder: vi.fn(),
}));

import { showSmsOrders } from "@/server/telegram/flows/sms/orders";
import { smsCountryListCallback } from "@/server/telegram/flows/sms/search";

describe("Telegram SMS callback UX", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the country search query when switching sort category", () => {
    expect(smsCountryListCallback({
      serviceId: 12,
      page: 1,
      category: "success",
      hasQuery: true,
    })).toBe("sms_country_search_page:12:1:success");
    expect(smsCountryListCallback({
      serviceId: 12,
      page: 2,
      category: "cheap",
      hasQuery: false,
    })).toBe("sms_countries:12:2:cheap");
  });

  it("does not offer cancel-all while every bulk number is still processing", async () => {
    mocks.findMany.mockResolvedValue([
      { id: "sms-1", status: "PROCESSING", phoneNumber: null, countryCode: "ID" },
      { id: "sms-2", status: "PROCESSING", phoneNumber: null, countryCode: "ID" },
    ]);
    mocks.count.mockResolvedValue(0);
    mocks.render.mockResolvedValue({ message_id: 90 });

    await showSmsOrders(mocks.render, "123", 90);

    const buttons = mocks.render.mock.calls[0][0].replyMarkup.inline_keyboard.flat();
    expect(buttons).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ callback_data: "sms_cancel_all" }),
    ]));
  });

  it("offers cancel-all only for the currently cancellable active numbers", async () => {
    mocks.findMany.mockResolvedValue([
      { id: "sms-1", status: "ACTIVE", phoneNumber: "+6281", countryCode: "ID" },
      { id: "sms-2", status: "ACTIVE", phoneNumber: "+6282", countryCode: "ID" },
      { id: "sms-3", status: "PROCESSING", phoneNumber: null, countryCode: "ID" },
    ]);
    mocks.count.mockResolvedValue(2);
    mocks.render.mockResolvedValue({ message_id: 90 });

    await showSmsOrders(mocks.render, "123", 90);

    const buttons = mocks.render.mock.calls[0][0].replyMarkup.inline_keyboard.flat();
    expect(buttons).toEqual(expect.arrayContaining([
      expect.objectContaining({
        text: expect.stringContaining("2"),
        callback_data: "sms_cancel_all",
      }),
    ]));
  });
});
