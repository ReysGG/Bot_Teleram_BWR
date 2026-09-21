import { describe, expect, it } from "vitest";
import {
  DEFAULT_ACCOUNT_REDEEM_DESCRIPTION,
  getAccountRedeemSettings,
  normalizeAccountRedeemDescription,
  setAccountRedeemDescription,
} from "@/server/redeem/settings";

type RedeemSettingRow = {
  accountRedeemDescription: string | null;
  accountRedeemDescriptionUpdatedBy: string | null;
  accountRedeemDescriptionUpdatedAt: Date | null;
};

function redeemSettingsClient(row: RedeemSettingRow | null) {
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

  return {
    client,
    upsertInput: () => upsertInput,
  };
}

describe("account redeem runtime settings", () => {
  it("uses the default description when the singleton row is missing", async () => {
    const { client } = redeemSettingsClient(null);

    await expect(getAccountRedeemSettings(client)).resolves.toMatchObject({
      description: DEFAULT_ACCOUNT_REDEEM_DESCRIPTION,
    });
    expect(DEFAULT_ACCOUNT_REDEEM_DESCRIPTION.trim().length).toBeGreaterThan(0);
  });

  it.each([null, "", " \r\n\t "])(
    "uses the default description for an empty stored value: %j",
    async (description) => {
      const { client } = redeemSettingsClient({
        accountRedeemDescription: description,
        accountRedeemDescriptionUpdatedBy: "admin@example.test",
        accountRedeemDescriptionUpdatedAt: new Date("2026-08-10T10:00:00.000Z"),
      });

      await expect(getAccountRedeemSettings(client)).resolves.toMatchObject({
        description: DEFAULT_ACCOUNT_REDEEM_DESCRIPTION,
      });
    },
  );

  it("returns the configured multiline description after normalizing CRLF and edges", async () => {
    const { client } = redeemSettingsClient({
      accountRedeemDescription: "  Baris pertama\r\nBaris kedua\r\n  ",
      accountRedeemDescriptionUpdatedBy: "admin@example.test",
      accountRedeemDescriptionUpdatedAt: new Date("2026-08-10T10:00:00.000Z"),
    });

    await expect(getAccountRedeemSettings(client)).resolves.toMatchObject({
      description: "Baris pertama\nBaris kedua",
    });
  });

  it("normalizes descriptions and treats blank input as a reset", () => {
    expect(
      normalizeAccountRedeemDescription("  Instruksi utama\r\n\r\nPeringatan  "),
    ).toBe("Instruksi utama\n\nPeringatan");
    expect(normalizeAccountRedeemDescription(" \r\n\t ")).toBeNull();
    expect(normalizeAccountRedeemDescription(null)).toBeNull();
    expect(normalizeAccountRedeemDescription(undefined)).toBeNull();
  });

  it("accepts at most 3000 normalized characters", () => {
    expect(normalizeAccountRedeemDescription("a".repeat(3_000))).toHaveLength(3_000);
    expect(() => normalizeAccountRedeemDescription("a".repeat(3_001))).toThrow(
      /3000|terlalu panjang|maximum|max/i,
    );
  });

  it("persists a normalized description with dedicated audit metadata", async () => {
    const store = redeemSettingsClient(null);

    await setAccountRedeemDescription(
      {
        description: "  Instruksi satu\r\nInstruksi dua  ",
        actor: "admin:owner@example.test",
      },
      store.client,
    );

    expect(store.upsertInput()).toMatchObject({
      where: { id: "global" },
      create: {
        id: "global",
        accountRedeemDescription: "Instruksi satu\nInstruksi dua",
        accountRedeemDescriptionUpdatedBy: "admin:owner@example.test",
      },
      update: {
        accountRedeemDescription: "Instruksi satu\nInstruksi dua",
        accountRedeemDescriptionUpdatedBy: "admin:owner@example.test",
      },
    });
  });

  it("writes null when an admin resets the description", async () => {
    const store = redeemSettingsClient(null);

    await setAccountRedeemDescription(
      { description: " \r\n ", actor: "admin:owner@example.test" },
      store.client,
    );

    expect(store.upsertInput()).toMatchObject({
      create: {
        accountRedeemDescription: null,
        accountRedeemDescriptionUpdatedBy: "admin:owner@example.test",
      },
      update: {
        accountRedeemDescription: null,
        accountRedeemDescriptionUpdatedBy: "admin:owner@example.test",
      },
    });
  });
});
