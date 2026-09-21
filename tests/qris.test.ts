import { describe, expect, it } from "vitest";
import {
  buildDynamicQrisPayload,
  createDynamicQrisPng,
  normalizeAndValidateStaticQrisPayload,
  parseQrisFields,
  qrisCrc16,
} from "@/server/payment/qris";

function staticPayload(): string {
  const body = "0002010102115204000053033605802ID5908K12 TEST6007JAKARTA";
  const withCrcHeader = `${body}6304`;
  return `${withCrcHeader}${qrisCrc16(withCrcHeader)}`;
}

describe("dynamic QRIS", () => {
  it("sets dynamic mode, exact amount, and a valid CRC", () => {
    const payload = buildDynamicQrisPayload(staticPayload(), 25_347);
    const fields = parseQrisFields(payload);
    expect(fields.find((field) => field.tag === "01")?.value).toBe("12");
    expect(fields.find((field) => field.tag === "54")?.value).toBe("25347");
    expect(fields.at(-1)?.tag).toBe("63");
    expect(fields.at(-1)?.value).toBe(qrisCrc16(payload.slice(0, -4)));
  });

  it("rejects a modified base payload", () => {
    const payload = staticPayload();
    expect(() => buildDynamicQrisPayload(`${payload.slice(0, -1)}0`, 1_000)).toThrow(
      "CRC",
    );
  });

  it("accepts only a CRC-valid static base without a fixed amount", () => {
    expect(normalizeAndValidateStaticQrisPayload(`  ${staticPayload()}  `)).toBe(
      staticPayload(),
    );
    const dynamic = buildDynamicQrisPayload(staticPayload(), 1_000);
    expect(() => normalizeAndValidateStaticQrisPayload(dynamic)).toThrow(
      "static",
    );
  });

  it("renders a high-resolution PNG for wallet gallery scanners", async () => {
    const png = await createDynamicQrisPng(staticPayload(), 25_347);

    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(1024);
    expect(png.readUInt32BE(20)).toBe(1024);
  });
});
