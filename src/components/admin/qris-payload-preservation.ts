// Whitespace inside an EMV TLV value contributes to its declared length and CRC.
export function preserveQrisPayload(value: string): string {
  return value.trim();
}

export function isShopeePartnerQrisPayload(value: string): boolean {
  return preserveQrisPayload(value).includes("0016ID.CO.SHOPEE.WWW");
}
