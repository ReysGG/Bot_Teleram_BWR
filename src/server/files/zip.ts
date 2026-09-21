import { deflateRawSync } from "node:zlib";
import { safeFilename } from "@/server/utils/format";

export type ZipArchiveEntry = {
  filename: string;
  content: Buffer;
};

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_DIRECTORY_HEADER_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const ZIP_VERSION = 20;
const DEFLATE_METHOD = 8;
const ZIP32_MAX_VALUE = 0xffffffff;
const ZIP32_MAX_ENTRIES = 0xffff;
const MAX_SAFE_FILENAME_LENGTH = 180;

// A fixed valid DOS timestamp keeps generated archives deterministic.
const DOS_TIME = 0;
const DOS_DATE = 0x0021;

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(content: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of content) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function filenameWithSuffix(filename: string, suffix: string): string {
  const dotIndex = filename.lastIndexOf(".");
  const hasExtension = dotIndex > 0;
  const extension = hasExtension ? filename.slice(dotIndex) : "";
  const basename = hasExtension ? filename.slice(0, dotIndex) : filename;
  const availableLength = Math.max(
    1,
    MAX_SAFE_FILENAME_LENGTH - extension.length - suffix.length,
  );
  return `${basename.slice(0, availableLength)}${suffix}${extension}`;
}

export function dedupeArchiveFilenames(filenames: string[]): string[] {
  const used = new Set<string>();

  return filenames.map((filename) => {
    const sanitized = safeFilename(filename);
    let candidate = sanitized;
    let suffixNumber = 2;

    while (used.has(candidate.toLowerCase())) {
      candidate = filenameWithSuffix(sanitized, `-${suffixNumber}`);
      suffixNumber += 1;
    }

    used.add(candidate.toLowerCase());
    return candidate;
  });
}

function assertZip32Value(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > ZIP32_MAX_VALUE) {
    throw new RangeError(`${label} exceeds the ZIP32 limit.`);
  }
}

export function createZipArchive(entries: ZipArchiveEntry[]): Buffer {
  if (entries.length > ZIP32_MAX_ENTRIES) {
    throw new RangeError("Archive has too many files for ZIP32.");
  }

  const filenames = dedupeArchiveFilenames(entries.map((entry) => entry.filename));
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  entries.forEach((entry, index) => {
    const filename = Buffer.from(filenames[index], "utf8");
    const compressed = deflateRawSync(entry.content);
    const checksum = crc32(entry.content);

    assertZip32Value(entry.content.length, "Uncompressed file size");
    assertZip32Value(compressed.length, "Compressed file size");
    assertZip32Value(localOffset, "Local header offset");

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(LOCAL_FILE_HEADER_SIGNATURE, 0);
    localHeader.writeUInt16LE(ZIP_VERSION, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(DEFLATE_METHOD, 8);
    localHeader.writeUInt16LE(DOS_TIME, 10);
    localHeader.writeUInt16LE(DOS_DATE, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(entry.content.length, 22);
    localHeader.writeUInt16LE(filename.length, 26);
    localHeader.writeUInt16LE(0, 28);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(CENTRAL_DIRECTORY_HEADER_SIGNATURE, 0);
    centralHeader.writeUInt16LE(ZIP_VERSION, 4);
    centralHeader.writeUInt16LE(ZIP_VERSION, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(DEFLATE_METHOD, 10);
    centralHeader.writeUInt16LE(DOS_TIME, 12);
    centralHeader.writeUInt16LE(DOS_DATE, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(entry.content.length, 24);
    centralHeader.writeUInt16LE(filename.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(localOffset, 42);

    localParts.push(localHeader, filename, compressed);
    centralParts.push(centralHeader, filename);
    localOffset += localHeader.length + filename.length + compressed.length;
  });

  const centralDirectory = Buffer.concat(centralParts);
  assertZip32Value(localOffset, "Central directory offset");
  assertZip32Value(centralDirectory.length, "Central directory size");

  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(END_OF_CENTRAL_DIRECTORY_SIGNATURE, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(entries.length, 8);
  endRecord.writeUInt16LE(entries.length, 10);
  endRecord.writeUInt32LE(centralDirectory.length, 12);
  endRecord.writeUInt32LE(localOffset, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, endRecord]);
}
