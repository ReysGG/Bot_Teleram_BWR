import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  calculateSmsPoolSellPrice,
  cancelSmsPoolOrder,
  checkSmsPoolOrder,
  getSmsPoolPricing,
  getSmsPoolBalance,
  getSmsPoolSuccessRates,
  matchesSmsPoolCountry,
  isSmsPoolFeaturedService,
  purchaseSmsPoolNumber,
  resolveSmsPoolPurchaseCostUsd,
  selectSmsPoolQuickCountries,
  smsPoolProviderPriceCeiling,
  smsPoolProviderPriceFloor,
  sortSmsPoolCountries,
  sortSmsPoolFeaturedServices,
} from "@/server/smspool/client";
import {
  resolveSmsPoolCheckState,
  resolveSmsPoolOrderState,
} from "@/server/smspool/order-state";
import {
  formatSmsPoolPhoneNumber,
  smsPoolPurchasePhoneNumber,
} from "@/server/smspool/phone";
import { isPrivateTelegramChatId } from "@/server/telegram/chat-safety";
import {
  smsConfirmCallback,
  smsCountryCallback,
  smsPurchaseCallback,
} from "@/server/smspool/telegram-callback";
import { resolveSmsPoolTelegramError } from "@/server/smspool/telegram-error";
import {
  compactSmsCountryName,
  pairSmsCountryButtons,
} from "@/server/smspool/telegram-layout";
import {
  MAX_SMSPOOL_BULK_QUANTITY,
  normalizeSmsPoolBulkQuantity,
} from "@/server/smspool/customer-orders";

describe("SMSPool API client", () => {
  it("allows OTP delivery only to positive private Telegram chat IDs", () => {
    expect(isPrivateTelegramChatId("7398144015")).toBe(true);
    expect(isPrivateTelegramChatId("-1001234567890")).toBe(false);
    expect(isPrivateTelegramChatId("@public_channel")).toBe(false);
  });
  it("does not treat completed_on as proof that an OTP arrived", () => {
    const pendingHistoryRow = {
      code: "0",
      full_code: "",
      status: "pending",
      completed_on: "2024-01-06 17:37:49",
    };
    expect(resolveSmsPoolOrderState(pendingHistoryRow)).toEqual({
      kind: "ACTIVE",
      otpCode: null,
      fullCode: null,
    });
    expect(resolveSmsPoolOrderState({
      code: "12345",
      full_code: "Your OpenAI code is 12345",
      status: "completed",
    })).toEqual({
      kind: "COMPLETED",
      otpCode: "12345",
      fullCode: "Your OpenAI code is 12345",
    });
  });

  it("maps official SMS check statuses without creating false success", () => {
    expect(resolveSmsPoolCheckState({ status: 1, sms: "", full_sms: "" })).toEqual({
      kind: "ACTIVE",
      otpCode: null,
      fullCode: null,
    });
    expect(resolveSmsPoolCheckState({ status: 6, sms: "", full_sms: "" })).toEqual({
      kind: "REFUNDED",
      otpCode: null,
      fullCode: null,
    });
    expect(resolveSmsPoolCheckState({
      status: 3,
      sms: "",
      full_sms: "Your verification code is 984211",
    })).toEqual({
      kind: "COMPLETED",
      otpCode: "984211",
      fullCode: "Your verification code is 984211",
    });
  });

  it("keeps the international calling code on purchased numbers", () => {
    expect(smsPoolPurchasePhoneNumber({
      number: 1234567890,
      cc: "1",
      phonenumber: "234567890",
    })).toBe("+1234567890");
    expect(formatSmsPoolPhoneNumber("6862060087", "US")).toBe("+16862060087");
    expect(formatSmsPoolPhoneNumber("08123456789", "ID")).toBe("+628123456789");
  });

  it("renders country choices in compact two-column Telegram rows", () => {
    expect(pairSmsCountryButtons(["ID", "US", "GB", "PH", "AR"])).toEqual([
      ["ID", "US"],
      ["GB", "PH"],
      ["AR"],
    ]);
    expect(compactSmsCountryName("United States of America", 14)).toBe("United States…");
  });

  it("keeps country selection and final purchase as separate Telegram steps", () => {
    expect(smsCountryCallback(12, 9)).toBe("sms_country:12:9");
    expect(smsConfirmCallback(12, 9, 3)).toBe("sms_confirm:12:9:3");
    expect(smsPurchaseCallback(12, 9, 1)).toBe("sms_purchase:12:9");
    expect(smsPurchaseCallback(12, 9, 3)).toBe("sms_purchase_bulk:12:9:3");
  });

  beforeEach(() => {
    process.env.SMSPOOL_API_KEY = "k".repeat(32);
    process.env.SMSPOOL_TIMEOUT_MS = "5000";
    process.env.SMSPOOL_USD_TO_IDR_RATE = "18500";
    process.env.SMSPOOL_SERVICE_FEE_IDR = "2000";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.SMSPOOL_API_KEY;
    delete process.env.SMSPOOL_TIMEOUT_MS;
    delete process.env.SMSPOOL_USD_TO_IDR_RATE;
    delete process.env.SMSPOOL_SERVICE_FEE_IDR;
  });

  it("retrieves balance without exposing the key in the URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ balance: "5.25" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getSmsPoolBalance()).resolves.toBe(5.25);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.smspool.net/request/balance");
    expect(url).not.toContain(process.env.SMSPOOL_API_KEY!);
    expect((init.body as FormData).get("key")).toBe(process.env.SMSPOOL_API_KEY);
  });

  it("calculates the user selling price using the configured IDR rate and service fee", () => {
    expect(getSmsPoolPricing()).toEqual({ usdToIdrRate: 18_500, serviceFeeIdr: 2_000 });
    expect(calculateSmsPoolSellPrice("0.24")).toBe(6_440);
    expect(calculateSmsPoolSellPrice("0.10")).toBe(3_850);
  });

  it("reserves the upper provider price and settles from the actual purchase cost", () => {
    expect(smsPoolProviderPriceFloor({ low_price: 0.8, price: 4.5 })).toBe(0.8);
    expect(smsPoolProviderPriceCeiling({ low_price: 0.8, price: 4.5 })).toBe(4.5);
    expect(resolveSmsPoolPurchaseCostUsd({ cost: "1.25", cost_in_cents: 125 }, 4.5)).toBe(1.25);
    expect(resolveSmsPoolPurchaseCostUsd({ cost: "0", cost_in_cents: undefined }, 4.5)).toBe(4.5);
  });

  it("sorts country categories without changing the cheapest purchase price", () => {
    const countries = [
      { country_id: 1, name: "Alpha", short_name: "AA", success_rate: 30, price: 4.5, low_price: 0.8 },
      { country_id: 2, name: "Beta", short_name: "BB", success_rate: 95, price: 2, low_price: 1.2 },
    ];
    expect(sortSmsPoolCountries(countries, "cheap").map((item) => item.name)).toEqual(["Alpha", "Beta"]);
    expect(sortSmsPoolCountries(countries, "success").map((item) => item.name)).toEqual(["Beta", "Alpha"]);
    expect(smsPoolProviderPriceFloor(countries[1])).toBe(1.2);
  });

  it("keeps Indonesia as the default while offering distinct country alternatives", () => {
    const countries = [
      { country_id: 9, name: "Indonesia", short_name: "ID", success_rate: 70, price: 1, low_price: 0.8 },
      { country_id: 1, name: "United States", short_name: "US", success_rate: 95, price: 1.5, low_price: 1.2 },
      { country_id: 2, name: "India", short_name: "IN", success_rate: 60, price: 0.5, low_price: 0.4 },
    ];

    expect(
      selectSmsPoolQuickCountries(countries).map(({ kind, country }) => ({
        kind,
        country: country.short_name,
      })),
    ).toEqual([
      { kind: "default", country: "ID" },
      { kind: "cheap", country: "IN" },
      { kind: "success", country: "US" },
    ]);
  });

  it("does not duplicate Indonesia when it is also the cheapest recommendation", () => {
    const countries = [
      { country_id: 9, name: "Indonesia", short_name: "ID", success_rate: 90, price: 0.5, low_price: 0.4 },
      { country_id: 1, name: "United States", short_name: "US", success_rate: 95, price: 1.5, low_price: 1.2 },
    ];

    expect(
      selectSmsPoolQuickCountries(countries).map(({ kind, country }) => ({
        kind,
        country: country.short_name,
      })),
    ).toEqual([
      { kind: "default", country: "ID" },
      { kind: "success", country: "US" },
    ]);
  });

  it("searches countries by name, code, id, and familiar aliases", () => {
    const unitedStates = {
      country_id: 1,
      name: "United States",
      short_name: "US",
    };
    expect(matchesSmsPoolCountry(unitedStates, "United States")).toBe(true);
    expect(matchesSmsPoolCountry(unitedStates, "us")).toBe(true);
    expect(matchesSmsPoolCountry(unitedStates, "USA")).toBe(true);
    expect(matchesSmsPoolCountry(unitedStates, "amerika")).toBe(true);
    expect(matchesSmsPoolCountry(unitedStates, "1")).toBe(true);
    expect(matchesSmsPoolCountry(unitedStates, "Indonesia")).toBe(false);
  });

  it("limits the storefront SMS catalog to AI and Indonesia-focused platforms", () => {
    expect(isSmsPoolFeaturedService("OpenAI / ChatGPT")).toBe(true);
    expect(isSmsPoolFeaturedService("Tokopedia")).toBe(true);
    expect(isSmsPoolFeaturedService("Shopee Indonesia")).toBe(true);
    expect(isSmsPoolFeaturedService("Amazon")).toBe(false);
    expect(
      sortSmsPoolFeaturedServices([
        { ID: 1, name: "Tokopedia", favourite: 20 },
        { ID: 2, name: "OpenAI / ChatGPT", favourite: 1 },
        { ID: 3, name: "Discord", favourite: 100 },
      ]).map((service) => service.name),
    ).toEqual(["OpenAI / ChatGPT", "Tokopedia"]);
  });

  it("keeps customer SMS bulk purchases within a safe limit", () => {
    expect(normalizeSmsPoolBulkQuantity(1)).toBe(1);
    expect(normalizeSmsPoolBulkQuantity(MAX_SMSPOOL_BULK_QUANTITY)).toBe(5);
    expect(() => normalizeSmsPoolBulkQuantity(0)).toThrow("1-5");
    expect(() => normalizeSmsPoolBulkQuantity(6)).toThrow("1-5");
  });

  it("accepts success-rate rows that omit the legacy country field", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify([
            {
              country_id: 9,
              name: "Indonesia",
              short_name: "ID",
              price: "0.08",
              low_price: "0.06",
              success_rate: 53,
              stock: 319385,
            },
          ]),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    await expect(getSmsPoolSuccessRates(671)).resolves.toMatchObject([
      { country_id: 9, name: "Indonesia", low_price: 0.06 },
    ]);
  });

  it("sends a bounded one-time SMS purchase", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: 1,
          number: 1234567890,
          cc: "1",
          phonenumber: "234567890",
          order_id: "ABCDEFGH",
          country: "United States",
          service: "OpenAI",
          pool: 7,
          expires_in: 1200,
          expiration: 1705309968,
          cost: "0.24",
          cost_in_cents: 24,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const purchase = await purchaseSmsPoolNumber({
      country: "1",
      service: "39",
      pool: "7",
      maxPrice: "0.50",
      pricingOption: "1",
      quantity: 2,
    });
    expect(purchase).toMatchObject({ order_id: "ABCDEFGH", cost_in_cents: 24 });
    const body = fetchMock.mock.calls[0]?.[1]?.body as FormData;
    expect(Object.fromEntries(body.entries())).toMatchObject({
      key: "k".repeat(32),
      country: "1",
      service: "39",
      pool: "7",
      max_price: "0.50",
      pricing_option: "1",
      quantity: "2",
      create_token: "0",
      activation_type: "SMS",
    });
  });

  it("returns a sanitized provider error for failed cancellation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ success: 0, message: "<p>Order cannot be cancelled yet</p>" }),
          { status: 400, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    await expect(cancelSmsPoolOrder("ABCDEFGH")).rejects.toMatchObject({
      message: "Nomor ini belum dapat dibatalkan. Tunggu sekitar 1 menit lalu coba lagi.",
      status: 400,
    });
  });

  it("checks one missing order using the official SMS status endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        status: 3,
        sms: "443211",
        full_sms: "Your code is 443211",
        expiration: 1704562249,
      }), { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkSmsPoolOrder("ABCDEFGH")).resolves.toMatchObject({
      status: 3,
      sms: "443211",
    });
    const body = fetchMock.mock.calls[0]?.[1]?.body as FormData;
    expect(body.get("orderid")).toBe("ABCDEFGH");
  });

  it("hides insufficient provider credit behind a maintenance message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ success: 0, message: "Insufficient credit balance. Please top up." }),
          { status: 400, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    await expect(cancelSmsPoolOrder("ABCDEFGH")).rejects.toMatchObject({
      message: "Layanan SMS sedang maintenance atau sementara tidak tersedia. Silakan coba lagi nanti.",
      status: 400,
    });
  });

  it("shows unavailable number inventory separately from maintenance", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: 0,
            message: "We couldn't find an available phone number for you, please try again later!",
            type: "OUT_OF_STOCK",
          }),
          { status: 400, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    await expect(cancelSmsPoolOrder("ABCDEFGH")).rejects.toMatchObject({
      message: "Nomor tidak tersedia untuk aplikasi dan negara ini. Silakan pilih negara atau aplikasi lain.",
      status: 400,
    });
    expect(resolveSmsPoolTelegramError("Nomor tidak tersedia untuk aplikasi dan negara ini. Silakan pilih negara atau aplikasi lain.").kind).toBe("NO_NUMBERS");
    expect(resolveSmsPoolTelegramError("Unexpected internal parser error")).toEqual({
      kind: "GENERIC",
      message: "Permintaan SMS belum dapat diproses. Silakan pilih ulang aplikasi dan negara.",
    });
  });
});
