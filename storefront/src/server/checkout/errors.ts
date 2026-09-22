export class ActiveInvoiceError extends Error {
  readonly code = "ACTIVE_INVOICE";

  constructor(readonly orderId: string, readonly invoiceNumber: string) {
    super(`Masih ada invoice aktif ${invoiceNumber}. Bayar, batalkan, atau tunggu sampai kedaluwarsa.`);
    this.name = "ActiveInvoiceError";
  }
}

export class ActiveInvoiceLimitError extends Error {
  readonly code = "ACTIVE_INVOICE_LIMIT";
  constructor(readonly limit: number) {
    super(`Kamu memiliki ${limit} invoice yang masih aktif. Selesaikan atau batalkan salah satunya untuk membuat invoice baru.`);
    this.name = "ActiveInvoiceLimitError";
  }
}
