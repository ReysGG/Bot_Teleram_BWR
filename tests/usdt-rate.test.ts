import { describe, expect, it } from "vitest";
import {
  DEFAULT_USDT_IDR_RATE,
  formatIdrAsUsdt,
  formatUsdtMicros,
  formatUsdtMicrosForInput,
  idrToUsdtMicros,
  MAX_USDT_IDR_RATE,
  MIN_USDT_IDR_RATE,
  normalizeUsdtIdrRate,
} from "@/server/payment/usdt-amount";
import {
  getUsdtRateSetting,
  setUsdtRateSetting,
  USDT_RATE_SOURCE,
} from "@/server/payment/usdt-rate-setting";

type UsdtSettingRow = {
  usdtIdrRate: number;
  usdtIdrRateSource: string;
  usdtIdrRateUpdatedAt: Date | null;
  usdtIdrRateUpdatedBy: string | null;
};

function settingsClient(row: UsdtSettingRow | null) {
  let upsertInput: unknown;
  const client = {
    storeRuntimeSetting: {
      findUnique: async () => row,
      upsert: async (input: unknown) => {
        upsertInput = input;
        return row;
      },
    },
  } as never;
  return { client, upsertInput: () => upsertInput };
}

describe("USDT amount conversion", () => {
  it("uses integer micro-USDT and rounds every fractional micro upward", () => {
    expect(idrToUsdtMicros(37_000, 18_500)).toBe(2_000_000);
    expect(idrToUsdtMicros(10_000, 18_500)).toBe(540_541);
    expect(idrToUsdtMicros(1, 18_500)).toBe(55);
  });

  it("formats exact values without noisy zeroes and keeps useful precision", () => {
    expect(formatUsdtMicros(2_000_000)).toBe("2 USDT");
    expect(formatUsdtMicros(165_136)).toBe("0.165136 USDT");
    expect(formatUsdtMicrosForInput(1_234_500_001)).toBe("1234.500001");
    expect(formatIdrAsUsdt(37_000, 18_500)).toBe("2 USDT");
  });

  it("rejects unsafe amounts and rates outside the operational range", () => {
    expect(normalizeUsdtIdrRate(MIN_USDT_IDR_RATE)).toBe(MIN_USDT_IDR_RATE);
    expect(normalizeUsdtIdrRate(MAX_USDT_IDR_RATE)).toBe(MAX_USDT_IDR_RATE);
    expect(() => normalizeUsdtIdrRate(MIN_USDT_IDR_RATE - 1)).toThrow();
    expect(() => normalizeUsdtIdrRate(MAX_USDT_IDR_RATE + 1)).toThrow();
    expect(() => normalizeUsdtIdrRate(18_500.5)).toThrow();
    expect(() => idrToUsdtMicros(-1, DEFAULT_USDT_IDR_RATE)).toThrow();
  });
});

describe("USDT runtime rate setting", () => {
  it("uses Rp18,500 when the singleton setting does not exist", async () => {
    const store = settingsClient(null);
    await expect(getUsdtRateSetting(store.client)).resolves.toEqual({
      rate: DEFAULT_USDT_IDR_RATE,
      source: USDT_RATE_SOURCE,
      updatedAt: null,
      updatedBy: null,
    });
  });

  it("returns the persisted rate and dedicated audit metadata", async () => {
    const updatedAt = new Date("2026-08-18T01:00:00.000Z");
    const store = settingsClient({
      usdtIdrRate: 19_000,
      usdtIdrRateSource: USDT_RATE_SOURCE,
      usdtIdrRateUpdatedAt: updatedAt,
      usdtIdrRateUpdatedBy: "admin:owner@example.test",
    });
    await expect(getUsdtRateSetting(store.client)).resolves.toEqual({
      rate: 19_000,
      source: USDT_RATE_SOURCE,
      updatedAt,
      updatedBy: "admin:owner@example.test",
    });
  });

  it("upserts a validated manual rate with its actor and timestamp", async () => {
    const store = settingsClient(null);
    await setUsdtRateSetting(
      { rate: 18_750, actor: "admin:owner@example.test" },
      store.client,
    );
    expect(store.upsertInput()).toMatchObject({
      where: { id: "global" },
      create: {
        id: "global",
        usdtIdrRate: 18_750,
        usdtIdrRateSource: USDT_RATE_SOURCE,
        usdtIdrRateUpdatedBy: "admin:owner@example.test",
        usdtIdrRateUpdatedAt: expect.any(Date),
      },
      update: {
        usdtIdrRate: 18_750,
        usdtIdrRateSource: USDT_RATE_SOURCE,
        usdtIdrRateUpdatedBy: "admin:owner@example.test",
        usdtIdrRateUpdatedAt: expect.any(Date),
      },
    });
  });

  it("does not write an invalid rate", async () => {
    const store = settingsClient(null);
    await expect(
      setUsdtRateSetting(
        { rate: MAX_USDT_IDR_RATE + 1, actor: "admin:owner@example.test" },
        store.client,
      ),
    ).rejects.toThrow();
    expect(store.upsertInput()).toBeUndefined();
  });
});
