import { inflateRawSync } from "node:zlib";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  decryptedBuffers: [] as Buffer[],
  decryptStockFile: vi.fn((item: { encryptedPayload: string }) => {
    const content = Buffer.from(item.encryptedPayload, "utf8");
    mocks.decryptedBuffers.push(content);
    return content;
  }),
}));

vi.mock("@/server/stock/inventory", () => ({
  decryptStockFile: mocks.decryptStockFile,
}));

import {
  createStockExportArchive,
  type StockExportRecord,
} from "@/server/stock/export";

function record(id: string, filename: string, content: string): StockExportRecord {
  return {
    id,
    originalFilename: filename,
    encryptedPayload: content,
    encryptionIv: "iv",
    encryptionTag: "tag",
  };
}

async function* pages(items: StockExportRecord[]) {
  yield items;
}

function firstZipEntry(archive: Buffer) {
  const compressedSize = archive.readUInt32LE(18);
  const filenameLength = archive.readUInt16LE(26);
  const extraLength = archive.readUInt16LE(28);
  const filenameStart = 30;
  const contentStart = filenameStart + filenameLength + extraLength;
  return {
    filename: archive.subarray(filenameStart, filenameStart + filenameLength).toString("utf8"),
    content: inflateRawSync(
      archive.subarray(contentStart, contentStart + compressedSize),
    ).toString("utf8"),
  };
}

describe("admin stock ZIP export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.decryptedBuffers = [];
  });

  it("creates the ZIP and clears every decrypted source buffer", async () => {
    const archive = await createStockExportArchive(pages([
      record("stock-1", "account.json", "{\"account\":1}"),
      record("stock-2", "account.json", "{\"account\":2}"),
    ]));

    expect(firstZipEntry(archive)).toEqual({
      filename: "account.json",
      content: "{\"account\":1}",
    });
    expect(mocks.decryptedBuffers).toHaveLength(2);
    expect(mocks.decryptedBuffers.every((buffer) => buffer.every((byte) => byte === 0)))
      .toBe(true);
  });

  it("fails closed and clears buffers when aggregate plaintext exceeds the limit", async () => {
    await expect(createStockExportArchive(
      pages([record("stock-1", "large.txt", "123456")]),
      { maxBytes: 5 },
    )).rejects.toMatchObject({
      code: "stock-download-limit",
    });

    expect(mocks.decryptedBuffers).toHaveLength(1);
    expect(mocks.decryptedBuffers[0].every((byte) => byte === 0)).toBe(true);
  });
});
