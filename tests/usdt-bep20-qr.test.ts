import { describe, expect, it } from "vitest";
import { createUsdtBep20AddressQr } from "@/server/payment/usdt-bep20-qr";

describe("USDT BEP20 address QR", () => {
  it("creates a high-resolution PNG from a valid recipient address", async () => {
    const png = await createUsdtBep20AddressQr(
      "0x1111111111111111111111111111111111111111",
    );

    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(png.length).toBeGreaterThan(1_000);
  });

  it("rejects malformed addresses before generating a QR", async () => {
    await expect(createUsdtBep20AddressQr("0x1234")).rejects.toThrow(
      "Alamat BEP20 tidak valid",
    );
  });
});
