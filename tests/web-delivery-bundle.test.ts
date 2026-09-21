import { describe, expect, it } from "vitest";
import { buildWebDeliveryBundle, MAX_WEB_BUNDLE_BYTES } from "@/server/storefront/web-delivery-bundle";
describe("private web delivery bundles", () => {
  it("combines TXT without changing account delimiters or whitespace", () => {
    const result = buildWebDeliveryBundle("TEST", [{ filename: "a.txt", content: Buffer.from("a----pass----token\r\n") }, { filename: "b.txt", content: Buffer.from("b----pass----token  ") }]);
    expect(result.content.toString()).toBe("a----pass----token\r\nb----pass----token  ");
    expect(result.filename).toBe("TEST-2-gabungan.txt");
  });
  it("combines Codex JSON as one importable array", () => {
    const records = [1, 2].map(index => ({ email: `fixture-${index}@example.test`, accessToken: "synthetic-access-token-" + index }));
    const result = buildWebDeliveryBundle("TEST", records.map((record, i) => ({ filename: `${i}.json`, content: Buffer.from(JSON.stringify(record)) })));
    expect(JSON.parse(result.content.toString())).toHaveLength(2); expect(result.filename.endsWith(".json")).toBe(true);
  });
  it("uses ZIP for mixed/binary files and bounds output size", () => {
    const result = buildWebDeliveryBundle("TEST", [{ filename: "a.txt", content: Buffer.from("demo") }, { filename: "a.bin", content: Buffer.from([0, 255]) }]);
    expect(result.content.readUInt32LE(0)).toBe(0x04034b50); expect(result.filename.endsWith(".zip")).toBe(true);
    expect(() => buildWebDeliveryBundle("TEST", [{ filename: "large.bin", content: Buffer.alloc(MAX_WEB_BUNDLE_BYTES + 1) }])).toThrow(RangeError);
  });
});
