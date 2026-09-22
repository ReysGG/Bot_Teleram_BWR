import { detectStockContent } from "@/server/stock/credential";
import { buildNineRouterBulkImport } from "@/server/stock/nine-router-export";
import { createZipArchive } from "@/server/files/zip";
export const MAX_WEB_BUNDLE_BYTES = 20 * 1024 * 1024;

export function buildWebDeliveryBundle(invoice: string, files: Array<{ filename: string; content: Buffer }>) {
  if (!files.length) throw new Error("Empty delivery bundle");
  if (files.reduce((total, file) => total + file.content.byteLength, 0) > MAX_WEB_BUNDLE_BYTES) throw new RangeError("Bundle too large");
  const credentials = files.map(file => {
    try { const parsed = detectStockContent(file.content.toString("utf8")); return parsed.kind === "K12" ? parsed.credential : null; }
    catch { return null; }
  });
  const texts = files.map(file => {
    if (!/\.txt$/i.test(file.filename)) return null;
    try { return new TextDecoder("utf-8", { fatal: true }).decode(file.content); } catch { return null; }
  });
  let content: Buffer;
  let extension: string;
  if (credentials.every(value => value !== null)) {
    content = buildNineRouterBulkImport(credentials); extension = "json";
  } else if (texts.every(value => value !== null)) {
    // Preserve each file's content and separators; add only a missing line break.
    content = Buffer.from(texts.map((text, index) => index < texts.length - 1 && !text.endsWith("\n") ? text + "\n" : text).join(""), "utf8");
    extension = "txt";
  } else {
    content = createZipArchive(files); extension = "zip";
  }
  if (content.byteLength > MAX_WEB_BUNDLE_BYTES) { content.fill(0); throw new RangeError("Bundle too large"); }
  return { content, filename: `${invoice.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 100)}-${files.length}-gabungan.${extension}` };
}
