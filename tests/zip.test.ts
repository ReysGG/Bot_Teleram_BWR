import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  createZipArchive,
  dedupeArchiveFilenames,
} from "@/server/files/zip";

type ExtractedZipEntry = {
  filename: string;
  content: Buffer;
};

function extractLocalEntries(archive: Buffer): ExtractedZipEntry[] {
  const entries: ExtractedZipEntry[] = [];
  let offset = 0;

  while (archive.readUInt32LE(offset) === 0x04034b50) {
    const method = archive.readUInt16LE(offset + 8);
    const compressedSize = archive.readUInt32LE(offset + 18);
    const filenameLength = archive.readUInt16LE(offset + 26);
    const extraLength = archive.readUInt16LE(offset + 28);
    const filenameStart = offset + 30;
    const contentStart = filenameStart + filenameLength + extraLength;
    const compressedContent = archive.subarray(
      contentStart,
      contentStart + compressedSize,
    );

    expect(method).toBe(8);
    entries.push({
      filename: archive.subarray(filenameStart, contentStart - extraLength).toString("utf8"),
      content: inflateRawSync(compressedContent),
    });
    offset = contentStart + compressedSize;
  }

  return entries;
}

describe("ZIP archive builder", () => {
  it("creates a valid archive containing every file and its exact bytes", () => {
    const archive = createZipArchive([
      { filename: "first.json", content: Buffer.from('{"account":1}') },
      { filename: "notes.txt", content: Buffer.from("line one\nline two") },
      { filename: "binary.bin", content: Buffer.from([0, 1, 2, 255]) },
    ]);

    const extracted = extractLocalEntries(archive);
    expect(extracted.map((entry) => entry.filename)).toEqual([
      "first.json",
      "notes.txt",
      "binary.bin",
    ]);
    expect(extracted.map((entry) => entry.content)).toEqual([
      Buffer.from('{"account":1}'),
      Buffer.from("line one\nline two"),
      Buffer.from([0, 1, 2, 255]),
    ]);

    const endOffset = archive.length - 22;
    expect(archive.readUInt32LE(endOffset)).toBe(0x06054b50);
    expect(archive.readUInt16LE(endOffset + 10)).toBe(3);
  });

  it("sanitizes unsafe paths and deduplicates names case-insensitively", () => {
    expect(
      dedupeArchiveFilenames([
        "../account.json",
        "account.json",
        "ACCOUNT.JSON",
        "buyer folder/credential file.txt",
      ]),
    ).toEqual([
      "account.json",
      "account-2.json",
      "ACCOUNT-3.JSON",
      "credential_file.txt",
    ]);
  });

  it("generates a standards-compliant empty archive", () => {
    const archive = createZipArchive([]);

    expect(archive).toHaveLength(22);
    expect(archive.readUInt32LE(0)).toBe(0x06054b50);
    expect(archive.readUInt16LE(10)).toBe(0);
  });
});
