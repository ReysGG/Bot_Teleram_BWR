export function plainTextStockContent(
  filename: string,
  content: Buffer,
): string | null {
  if (!/\.txt$/i.test(filename)) return null;
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(content).trim();
    return decoded || null;
  } catch {
    return null;
  }
}

export function buildCombinedTextInventory(contents: string[]): Buffer {
  const normalized = contents.map((content) => content.trim()).filter(Boolean);
  if (normalized.length === 0) {
    throw new Error("TXT export requires at least one stock item");
  }
  return Buffer.from(`${normalized.join("\n")}\n`, "utf8");
}

export function combinedTextFilename(invoiceNumber: string, quantity: number): string {
  const safeInvoice = invoiceNumber.replace(/[^a-zA-Z0-9_-]+/g, "-");
  return `${safeInvoice}-${quantity}-items.txt`;
}
