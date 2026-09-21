import type { CredentialJson } from "@/server/stock/credential";

export function buildNineRouterBulkImport(credentials: CredentialJson[]): Buffer {
  if (credentials.length === 0) {
    throw new Error("9Router export requires at least one credential");
  }

  return Buffer.from(`${JSON.stringify(credentials, null, 2)}\n`, "utf8");
}

export function nineRouterBulkFilename(invoiceNumber: string, quantity: number): string {
  const safeInvoice = invoiceNumber.replace(/[^a-zA-Z0-9_-]+/g, "-");
  return `${safeInvoice}-${quantity}-accounts.9router.json`;
}
