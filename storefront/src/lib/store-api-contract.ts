export type StorefrontDeliveryState =
  | "WAITING_PAYMENT"
  | "PROCESSING"
  | "READY"
  | "DELIVERED"
  | "CANCELLED"
  | "EXPIRED"
  | "REFUNDED";

export type StorefrontOrderSummary = {
  id: string;
  invoiceNumber: string;
  createdAt: string;
  expiresAt: string;
  paidAt: string | null;
  completedAt: string | null;
  status: string;
  paymentStatus: string;
  paymentMethod: string | null;
  billedAmount: number;
  grandTotal: number;
  productName: string;
  variantLabel: string | null;
  quantity: number;
  deliveryState: StorefrontDeliveryState;
  readyFiles: number;
  deliveredFiles: number;
};

export type StorefrontPaymentInstructions =
  | { type: "QRIS"; amount: number; imagePath: string }
  | { type: "JAGO_TRANSFER"; amount: number; accountNumber: string }
  | { type: "BINANCE_INTERNAL"; recipientId: string; amountUsdt: string; status: string; submittedOrderId: string | null }
  | { type: "USDT_BEP20"; recipientAddress: string; tokenContract: string; chainId: number; amountUsdt: string; status: string; txHash: string | null; confirmations: number | null; requiredConfirmations: number }
  | { type: "WALLET"; amount: number }
  | null;

export type StorefrontOrderDetail = StorefrontOrderSummary & {
  paymentInstructions: StorefrontPaymentInstructions;
  guidance: Array<{ productId: string; productName: string; text: string; redeemUrl?: string | null; entities?: Array<{ type: "bold" | "italic" | "underline" | "strikethrough" | "spoiler" | "code" | "blockquote" | "text_link"; offset: number; length: number; url?: string }> }>;
  attachments: Array<{
    productId: string;
    productName: string;
    filename: string;
    downloadPath: string;
  }>;
  deliveries: Array<{
    id: string;
    unitNumber: number;
    filename: string;
    status: string;
    downloadCount: number;
    lastDownloadedAt: string | null;
    downloadPath: string;
  }>;
};

export type StorefrontAccessResponse = {
  ok: true;
  sessionToken: string;
  expiresAt: string;
  customer: { contactMasked: string; walletBalance: number };
  orders: StorefrontOrderSummary[];
};

export type StorefrontCheckoutResponse = {
  ok: true;
  sessionToken: string;
  expiresAt: string;
  customer: { contactMasked: string; walletBalance: number };
  order: StorefrontOrderDetail;
};
