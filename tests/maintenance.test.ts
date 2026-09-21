import { describe, expect, it } from "vitest";
import {
  assertStoreOrderingAvailable,
  getMaintenanceState,
} from "@/server/store/maintenance";

function maintenanceClient(
  state: { maintenanceMode: boolean; maintenanceMessage: string | null } | null,
) {
  return {
    storeRuntimeSetting: {
      findUnique: async () =>
        state
          ? {
              id: "global",
              ...state,
              updatedBy: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            }
          : null,
    },
  } as never;
}

describe("global maintenance mode", () => {
  it("keeps checkout open when no maintenance setting exists", async () => {
    expect(await getMaintenanceState(maintenanceClient(null))).toMatchObject({
      enabled: false,
    });
    await expect(
      assertStoreOrderingAvailable(maintenanceClient(null)),
    ).resolves.toBeUndefined();
  });

  it("blocks new checkout with the configured buyer message", async () => {
    const client = maintenanceClient({
      maintenanceMode: true,
      maintenanceMessage: "Tunggu maintenance selesai.",
    });
    await expect(assertStoreOrderingAvailable(client)).rejects.toThrow(
      "Tunggu maintenance selesai.",
    );
  });
});
