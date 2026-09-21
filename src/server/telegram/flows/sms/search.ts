import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { formatRupiah } from "@/server/utils/format";
import {
  calculateSmsPoolSellPrice,
  getSmsPoolServices,
  getSmsPoolSuccessRates,
  matchesSmsPoolCountry,
  selectSmsPoolQuickCountries,
  smsPoolProviderPriceFloor,
  sortSmsPoolCountries,
  sortSmsPoolFeaturedServices,
  SMSPOOL_NO_NUMBERS_MESSAGE,
  SMSPOOL_UNAVAILABLE_MESSAGE,
  type SmsPoolCountryCategory,
} from "@/server/smspool/client";
import { smsCountryCallback } from "@/server/smspool/telegram-callback";
import {
  compactSmsCountryName,
  pairSmsCountryButtons,
} from "@/server/smspool/telegram-layout";
import { smsCountryFlag } from "./format";
import type { PendingSmsSearch, SmsNavigationRenderer } from "./types";

const SMS_SERVICE_PAGE_SIZE = 8;
const SMS_COUNTRY_PAGE_SIZE = 10;
const SMSPOOL_INDONESIA_COUNTRY_ID = 9;
const TELEGRAM_ADMIN_ID = "7398144015";

export function parsePendingSmsSearch(value: Prisma.JsonValue | null): PendingSmsSearch | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (typeof value.messageId !== "number") return null;
  return {
    messageId: value.messageId,
    countryServiceId: typeof value.countryServiceId === "number"
      ? value.countryServiceId
      : undefined,
    countryCategory: value.countryCategory === "success" ? "success" : "cheap",
  };
}

export function smsCountryListCallback(input: {
  serviceId: number;
  page: number;
  category: SmsPoolCountryCategory;
  hasQuery: boolean;
}) {
  return input.hasQuery
    ? `sms_country_search_page:${input.serviceId}:${input.page}:${input.category}`
    : `sms_countries:${input.serviceId}:${input.page}:${input.category}`;
}

export async function showSmsServices(
  render: SmsNavigationRenderer,
  chatId: string,
  messageId?: number,
  page = 1,
) {
  const services = sortSmsPoolFeaturedServices(await getSmsPoolServices());
  const totalPages = Math.max(1, Math.ceil(services.length / SMS_SERVICE_PAGE_SIZE));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const visible = services.slice(
    (currentPage - 1) * SMS_SERVICE_PAGE_SIZE,
    currentPage * SMS_SERVICE_PAGE_SIZE,
  );
  const pagination = [
    ...(currentPage > 1
      ? [{ text: "⬅️", callback_data: `sms_services:${currentPage - 1}` }]
      : []),
    { text: `${currentPage}/${totalPages}`, callback_data: `sms_services:${currentPage}` },
    ...(currentPage < totalPages
      ? [{ text: "➡️", callback_data: `sms_services:${currentPage + 1}` }]
      : []),
  ];
  await render({
    chatId,
    messageId,
    text: [
      "📲 NOMOR SMS & OTP",
      "",
      "Indonesia menjadi negara default. Negara lain tetap tersedia.",
      "Pilih aplikasi, lalu pilih negara dan jumlah nomor.",
      "Harga yang tampil sudah final.",
      "",
      `Halaman ${currentPage}/${totalPages}`,
    ].join("\n"),
    replyMarkup: {
      inline_keyboard: [
        [
          { text: "🔎 Cari aplikasi", callback_data: "sms_search" },
          { text: "🧾 Order saya", callback_data: "sms_orders" },
        ],
        ...visible.map((service) => [
          { text: service.name, callback_data: `sms_quick:${service.ID}` },
        ]),
        pagination,
        [{ text: "☎️ Bantuan admin", url: `tg://user?id=${TELEGRAM_ADMIN_ID}` }],
        [{ text: "⬅️ Kembali", callback_data: "menu" }],
      ],
    },
  });
}

export async function showSmsSearchPrompt(
  render: SmsNavigationRenderer,
  chatId: string,
  messageId?: number,
) {
  const rendered = await render({
    chatId,
    messageId,
    text: "🔎 Cari layanan Indonesia & AI\n\nKirim nama platform yang dicari.\nContoh: OpenAI, Tokopedia, Shopee, Gojek.",
    replyMarkup: {
      inline_keyboard: [[{ text: "⬅️ Kembali", callback_data: "sms_services:1" }]],
    },
  });
  await prisma.botSession.upsert({
    where: { chatId },
    create: {
      chatId,
      state: "AWAITING_SMS_SEARCH",
      cart: { messageId: rendered.message_id },
      smsSearchQuery: null,
    },
    update: {
      state: "AWAITING_SMS_SEARCH",
      cart: { messageId: rendered.message_id },
      smsSearchQuery: null,
    },
  });
}

export async function showSmsSearchResults(
  render: SmsNavigationRenderer,
  chatId: string,
  query: string,
  messageId: number,
  page = 1,
) {
  const normalized = query.trim().toLocaleLowerCase("id-ID");
  const services = sortSmsPoolFeaturedServices(await getSmsPoolServices())
    .filter((service) => service.name.toLocaleLowerCase("id-ID").includes(normalized));
  const totalPages = Math.max(1, Math.ceil(services.length / SMS_SERVICE_PAGE_SIZE));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const visible = services.slice(
    (currentPage - 1) * SMS_SERVICE_PAGE_SIZE,
    currentPage * SMS_SERVICE_PAGE_SIZE,
  );
  await prisma.botSession.updateMany({
    where: { chatId },
    data: {
      state: "BROWSING",
      cart: Prisma.JsonNull,
      smsSearchQuery: query.trim().slice(0, 50),
    },
  });
  const pagination = [
    ...(currentPage > 1
      ? [{ text: "⬅️", callback_data: `sms_search_page:${currentPage - 1}` }]
      : []),
    { text: `${currentPage}/${totalPages}`, callback_data: `sms_search_page:${currentPage}` },
    ...(currentPage < totalPages
      ? [{ text: "➡️", callback_data: `sms_search_page:${currentPage + 1}` }]
      : []),
  ];
  await render({
    chatId,
    messageId,
    text: services.length
      ? `🔎 HASIL SMS: “${query.trim().slice(0, 50)}”\n\n${services.length} layanan · Halaman ${currentPage}/${totalPages}\nPilih aplikasi, lalu tentukan negara.`
      : `🔎 Layanan Indonesia/AI untuk “${query.trim().slice(0, 50)}” belum tersedia. Coba OpenAI, Tokopedia, Shopee, atau Gojek.`,
    replyMarkup: {
      inline_keyboard: [
        ...visible.map((service) => [{
          text: service.name,
          callback_data: `sms_quick:${service.ID}`,
        }]),
        ...(services.length ? [pagination] : []),
        [
          { text: "🔎 Cari lagi", callback_data: "sms_search" },
          { text: "📋 Pilihan utama", callback_data: "sms_services:1" },
        ],
      ],
    },
  });
}

export async function showSmsCountryQuickPick(
  render: SmsNavigationRenderer,
  chatId: string,
  serviceId: number,
  messageId?: number,
) {
  const [services, rates] = await Promise.all([
    getSmsPoolServices(),
    getSmsPoolSuccessRates(serviceId),
  ]);
  const service = services.find((item) => item.ID === serviceId);
  if (!service) throw new Error(SMSPOOL_UNAVAILABLE_MESSAGE);

  const quickCountries = selectSmsPoolQuickCountries(rates, SMSPOOL_INDONESIA_COUNTRY_ID);
  if (quickCountries.length === 0) throw new Error(SMSPOOL_NO_NUMBERS_MESSAGE);
  const defaultCountry = quickCountries[0].country;
  const quickRows = quickCountries.map(({ kind, country }) => {
    const price = calculateSmsPoolSellPrice(smsPoolProviderPriceFloor(country));
    const prefix = kind === "default"
      ? `${smsCountryFlag(country.short_name)} Default`
      : kind === "cheap"
        ? "💸 Termurah"
        : "⭐ Sering berhasil";
    return [{
      text: `${prefix} ${country.name} · ${formatRupiah(price)}`,
      callback_data: smsCountryCallback(serviceId, country.country_id),
    }];
  });

  await render({
    chatId,
    messageId,
    text: [
      `📲 ${service.name}`,
      "",
      `${smsCountryFlag(defaultCountry.short_name)} ${defaultCountry.name} dipilih sebagai default.`,
      "Tekan default untuk lanjut, atau pilih negara lain.",
      "Harga yang terlihat adalah harga final.",
    ].join("\n"),
    replyMarkup: {
      inline_keyboard: [
        ...quickRows,
        [
          { text: "🌍 Negara lain", callback_data: `sms_countries:${serviceId}:1:cheap` },
          { text: "🔎 Cari negara", callback_data: `sms_country_search:${serviceId}:cheap` },
        ],
        [{ text: "⬅️ Ganti layanan", callback_data: "sms_services:1" }],
      ],
    },
  });
}

export async function showSmsCountries(
  render: SmsNavigationRenderer,
  chatId: string,
  serviceId: number,
  messageId?: number,
  page = 1,
  category: SmsPoolCountryCategory = "cheap",
  query?: string | null,
) {
  const [services, rates] = await Promise.all([
    getSmsPoolServices(),
    getSmsPoolSuccessRates(serviceId),
  ]);
  const service = services.find((item) => item.ID === serviceId);
  if (!service) throw new Error(SMSPOOL_UNAVAILABLE_MESSAGE);
  const normalizedQuery = query?.trim() ?? "";
  const countries = sortSmsPoolCountries(
    rates.filter((item) => {
      if (!(item.low_price > 0 || item.price > 0)) return false;
      return !normalizedQuery || matchesSmsPoolCountry(item, normalizedQuery);
    }),
    category,
  );
  const totalPages = Math.max(1, Math.ceil(countries.length / SMS_COUNTRY_PAGE_SIZE));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const visible = countries.slice(
    (currentPage - 1) * SMS_COUNTRY_PAGE_SIZE,
    currentPage * SMS_COUNTRY_PAGE_SIZE,
  );
  const pagination = [
    ...(currentPage > 1 ? [{
      text: "⬅️ Prev",
      callback_data: smsCountryListCallback({
        serviceId,
        page: currentPage - 1,
        category,
        hasQuery: Boolean(normalizedQuery),
      }),
    }] : []),
    {
      text: `${currentPage}/${totalPages}`,
      callback_data: smsCountryListCallback({
        serviceId,
        page: currentPage,
        category,
        hasQuery: Boolean(normalizedQuery),
      }),
    },
    ...(currentPage < totalPages ? [{
      text: "Next ➡️",
      callback_data: smsCountryListCallback({
        serviceId,
        page: currentPage + 1,
        category,
        hasQuery: Boolean(normalizedQuery),
      }),
    }] : []),
  ];
  const countryRows = pairSmsCountryButtons(
    visible.map((country) => {
      const price = calculateSmsPoolSellPrice(smsPoolProviderPriceFloor(country));
      return {
        text: `${smsCountryFlag(country.short_name)} ${compactSmsCountryName(country.name)} · ${formatRupiah(price)}`,
        callback_data: smsCountryCallback(serviceId, country.country_id),
      };
    }),
  );
  await render({
    chatId,
    messageId,
    text: [
      `🌍 Pilih negara untuk ${service.name}`,
      normalizedQuery ? `🔎 Hasil pencarian: “${query?.trim().slice(0, 50)}”` : null,
      "",
      `${countries.length} negara · Halaman ${currentPage}/${totalPages}`,
      `Urutan: ${category === "cheap" ? "💸 Termurah" : "⭐ Sering berhasil"}`,
      "Harga yang tampil adalah harga final.",
    ].filter(Boolean).join("\n"),
    replyMarkup: {
      inline_keyboard: [
        ...countryRows,
        ...(countries.length ? [pagination] : []),
        [
          {
            text: category === "cheap" ? "✅ Termurah" : "💸 Termurah",
            callback_data: smsCountryListCallback({
              serviceId,
              page: 1,
              category: "cheap",
              hasQuery: Boolean(normalizedQuery),
            }),
          },
          {
            text: category === "success" ? "✅ Sering berhasil" : "⭐ Sering berhasil",
            callback_data: smsCountryListCallback({
              serviceId,
              page: 1,
              category: "success",
              hasQuery: Boolean(normalizedQuery),
            }),
          },
        ],
        [{ text: "🔎 Ketik nama/kode negara", callback_data: `sms_country_search:${serviceId}:${category}` }],
        [
          { text: "⬅️ Pilihan negara", callback_data: `sms_quick:${serviceId}` },
          { text: "📱 Ganti aplikasi", callback_data: "sms_services:1" },
        ],
      ],
    },
  });
}

export async function showSmsCountrySearchPrompt(
  render: SmsNavigationRenderer,
  chatId: string,
  serviceId: number,
  category: SmsPoolCountryCategory,
  messageId?: number,
) {
  const rendered = await render({
    chatId,
    messageId,
    text: "🔎 Cari negara\n\nKetik nama, kode, atau nama lokal negara.\nContoh: Indonesia, Indo, Amerika, USA, Inggris, UK.",
    replyMarkup: {
      inline_keyboard: [
        [
          { text: "🇮🇩 Indonesia", callback_data: `sms_country_term:${serviceId}:${category}:ID` },
          { text: "🇺🇸 Amerika", callback_data: `sms_country_term:${serviceId}:${category}:US` },
        ],
        [
          { text: "🇬🇧 Inggris", callback_data: `sms_country_term:${serviceId}:${category}:GB` },
          { text: "⬅️ Kembali", callback_data: `sms_quick:${serviceId}` },
        ],
      ],
    },
  });
  await prisma.botSession.upsert({
    where: { chatId },
    create: {
      chatId,
      state: "AWAITING_SMS_SEARCH",
      cart: { messageId: rendered.message_id, countryServiceId: serviceId, countryCategory: category },
      smsSearchQuery: null,
    },
    update: {
      state: "AWAITING_SMS_SEARCH",
      cart: { messageId: rendered.message_id, countryServiceId: serviceId, countryCategory: category },
      smsSearchQuery: null,
    },
  });
}

export async function handleSmsSearchInput(input: {
  render: SmsNavigationRenderer;
  chatId: string;
  text: string;
  cart: Prisma.JsonValue | null;
}) {
  const pending = parsePendingSmsSearch(input.cart);
  if (!pending) {
    await prisma.botSession.updateMany({
      where: { chatId: input.chatId },
      data: { state: "BROWSING", cart: Prisma.JsonNull },
    });
    await showSmsServices(input.render, input.chatId);
    return;
  }
  if (input.text.length < 2 || input.text.length > 50) {
    await input.render({
      chatId: input.chatId,
      messageId: pending.messageId,
      text: "❌ Kata pencarian harus 2-50 karakter.\n\nContoh: OpenAI, Tokopedia, Shopee.",
      replyMarkup: {
        inline_keyboard: [[{ text: "⬅️ Kembali", callback_data: "sms_services:1" }]],
      },
    });
    return;
  }
  if (pending.countryServiceId) {
    await prisma.botSession.updateMany({
      where: { chatId: input.chatId },
      data: {
        state: "BROWSING",
        cart: Prisma.JsonNull,
        smsSearchQuery: input.text.slice(0, 50),
      },
    });
    await showSmsCountries(
      input.render,
      input.chatId,
      pending.countryServiceId,
      pending.messageId,
      1,
      pending.countryCategory ?? "cheap",
      input.text,
    );
    return;
  }
  await showSmsSearchResults(
    input.render,
    input.chatId,
    input.text,
    pending.messageId,
  );
}
