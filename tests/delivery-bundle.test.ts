import { describe, expect, it } from "vitest";
import {
  buildDeliveryBundleContent,
  buildBoundedDeliveryChunks,
  deliveryBundleFilename,
  deliveryBundleFormatFor,
  digitalDeliveryClaimTake,
  MAX_DIGITAL_DELIVERY_CHUNK_BYTES,
  MAX_DIGITAL_DELIVERY_CHUNK_ITEMS,
} from "@/server/telegram/delivery-bundle";

describe("large digital delivery bundles", () => {
  it("splits 598 units into six deterministic worker-sized chunks", () => {
    const units = Array.from({ length: 598 }, (_, index) => index + 1);
    const chunks = buildBoundedDeliveryChunks(
      units,
      (items) => Buffer.from(JSON.stringify(items), "utf8"),
    );

    expect(chunks.map((chunk) => chunk.items.length)).toEqual([
      100,
      100,
      100,
      100,
      100,
      98,
    ]);
    expect(chunks.map((chunk) => [chunk.items[0], chunk.items.at(-1)])).toEqual([
      [1, 100],
      [101, 200],
      [201, 300],
      [301, 400],
      [401, 500],
      [501, 598],
    ]);
    expect(chunks.every((chunk) => chunk.items.length <= 100)).toBe(true);
    expect(chunks.every((chunk) => chunk.content.byteLength <= 20 * 1024 * 1024)).toBe(true);
  });

  it("bisects a rendered batch until the actual byte output is within its cap", () => {
    const chunks = buildBoundedDeliveryChunks(
      [1, 2, 3],
      (items) => Buffer.alloc(items.length * 4, items.length),
      { maxItems: 100, maxBytes: 8 },
    );

    expect(chunks.map((chunk) => chunk.items)).toEqual([[1, 2], [3]]);
    expect(chunks.map((chunk) => chunk.content.byteLength)).toEqual([8, 4]);
    expect(() =>
      buildBoundedDeliveryChunks(
        [1],
        () => Buffer.alloc(9),
        { maxItems: 100, maxBytes: 8 },
      )
    ).toThrow("One digital stock item exceeds");
  });

  it("uses one shared 100-item ceiling for claims and rendered chunks", () => {
    expect(digitalDeliveryClaimTake()).toBe(100);
    expect(digitalDeliveryClaimTake()).toBe(MAX_DIGITAL_DELIVERY_CHUNK_ITEMS);
    expect(MAX_DIGITAL_DELIVERY_CHUNK_BYTES).toBe(20 * 1024 * 1024);
  });

  it("selects K12, TXT, or universal ZIP fallback deterministically", () => {
    expect(deliveryBundleFormatFor([
      { credential: { accessToken: "one" }, textContent: null },
      { credential: { accessToken: "two" }, textContent: null },
    ])).toBe("K12");
    expect(deliveryBundleFormatFor([
      { credential: null, textContent: "one" },
      { credential: null, textContent: "two" },
    ])).toBe("TEXT");
    expect(deliveryBundleFormatFor([
      { credential: { accessToken: "one" }, textContent: null },
      { credential: null, textContent: "two" },
    ])).toBe("ZIP");
    expect(deliveryBundleFormatFor([
      { credential: null, textContent: null },
      { credential: null, textContent: null },
    ])).toBe("ZIP");
  });

  it("renders importable K12, combined TXT, and ZIP fallback payloads", () => {
    const k12 = buildDeliveryBundleContent("K12", [
      {
        filename: "one.json",
        fileContent: Buffer.from("ignored"),
        credential: { accessToken: "a".repeat(24), email: "one@example.test" },
        textContent: null,
      },
      {
        filename: "two.json",
        fileContent: Buffer.from("ignored"),
        credential: { accessToken: "b".repeat(24), email: "two@example.test" },
        textContent: null,
      },
    ]);
    const text = buildDeliveryBundleContent("TEXT", [
      {
        filename: "one.txt",
        fileContent: Buffer.from("one"),
        credential: null,
        textContent: "one",
      },
      {
        filename: "two.txt",
        fileContent: Buffer.from("two"),
        credential: null,
        textContent: "two",
      },
    ]);
    const zip = buildDeliveryBundleContent("ZIP", [
      {
        filename: "account.json",
        fileContent: Buffer.from('{"account":1}'),
        credential: { accessToken: "a".repeat(24) },
        textContent: null,
      },
      {
        filename: "guide.pdf",
        fileContent: Buffer.from("pdf-content"),
        credential: null,
        textContent: null,
      },
    ]);

    expect(JSON.parse(k12.toString("utf8"))).toHaveLength(2);
    expect(text.toString("utf8")).toBe("one\ntwo\n");
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);
  });

  it("builds stable K12, TXT, and ZIP filenames with unit ranges", () => {
    expect(deliveryBundleFilename({
      invoiceNumber: "TGS/20260901:ABC",
      format: "K12",
      quantity: 100,
      unitStart: 1,
      unitEnd: 100,
      totalUnits: 598,
    })).toBe("TGS-20260901-ABC-0001-0100-of-0598-accounts.9router.json");
    expect(deliveryBundleFilename({
      invoiceNumber: "TGS/20260901:ABC",
      format: "TEXT",
      quantity: 100,
      unitStart: 101,
      unitEnd: 200,
      totalUnits: 598,
    })).toBe("TGS-20260901-ABC-0101-0200-of-0598-items.txt");
    expect(deliveryBundleFilename({
      invoiceNumber: "TGS/20260901:ABC",
      format: "ZIP",
      quantity: 98,
      unitStart: 501,
      unitEnd: 598,
      totalUnits: 598,
    })).toBe("TGS-20260901-ABC-0501-0598-of-0598-files.zip");
    expect(deliveryBundleFilename({
      invoiceNumber: "TGS/20260901:ABC",
      format: "K12",
      quantity: 2,
      unitStart: 1,
      unitEnd: 2,
      totalUnits: 2,
    })).toBe("TGS-20260901-ABC-2-accounts.9router.json");
  });
});
