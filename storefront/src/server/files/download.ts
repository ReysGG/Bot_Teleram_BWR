import { safeFilename } from "@/server/utils/format";

export function contentDisposition(filename: string): string {
  const safe = safeFilename(filename);
  const ascii = safe.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

export function sensitiveDownloadHeaders(input: {
  filename: string;
  contentLength: number;
  contentType?: string;
}): Record<string, string> {
  return {
    "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
    "Content-Disposition": contentDisposition(input.filename),
    "Content-Length": String(input.contentLength),
    "Content-Security-Policy": "sandbox",
    "Content-Type": input.contentType ?? "application/octet-stream",
    "Cross-Origin-Resource-Policy": "same-origin",
    Expires: "0",
    Pragma: "no-cache",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, noarchive, nosnippet",
  };
}
