import { OrderDetailView } from "../../src/components/orders/order-detail-view";
import type { StorefrontOrderDetail } from "../../src/lib/store-api-contract";

export const previewOrder: StorefrontOrderDetail = {
  id: "demo-invoice", invoiceNumber: "DEMO-INVOICE-001", productName: "ChatGPT Codex JSON (Free Plan + Mail)", variantLabel: null,
  createdAt: "2026-09-17T01:00:00Z", expiresAt: "2026-09-17T01:30:00Z", paidAt: "2026-09-17T01:05:00Z", completedAt: "2026-09-17T01:06:00Z",
  status: "COMPLETED", paymentStatus: "PAID", paymentMethod: "QRIS", billedAmount: 3011, grandTotal: 3000, quantity: 1, deliveryState: "DELIVERED", readyFiles: 0, deliveredFiles: 1,
  paymentInstructions: null, attachments: [],
  guidance: [{ productId: "demo", productName: "ChatGPT Codex JSON (Free Plan + Mail)", text: "1. Download file produk di atas.\n2. Ambil data login pasangan melalui kartu Data login Codex Free.\n3. Simpan file dengan aman dan jangan bagikan kepada orang lain." }],
  deliveries: [{ id: "demo-file", unitNumber: 1, filename: "contoh-produk.json", status: "SENT", downloadCount: 1, lastDownloadedAt: null, downloadPath: "" }],
};

export function OrderDetailPreview() {
  const state = new URLSearchParams(window.location.search).get("state") ?? "delivered";
  const order = { ...previewOrder };
  if (state !== "delivered") { order.completedAt = null; order.deliveredFiles = 0; order.deliveries = []; order.guidance = []; }
  if (state === "pending") Object.assign(order, { status: "PENDING_PAYMENT", paymentStatus: "PENDING", deliveryState: "WAITING_PAYMENT", paidAt: null, paymentInstructions: { type: "QRIS", amount: 3011, imagePath: "" } });
  if (state === "ready") Object.assign(order, { status: "FULFILLING", deliveryState: "READY", readyFiles: 1, deliveries: [{ ...previewOrder.deliveries[0], status: "READY", downloadCount: 0 }] });
  if (state === "waiting") Object.assign(order, { status: "PAID_WAITING_STOCK", deliveryState: "PROCESSING" });
  if (["expired", "refunded", "cancelled"].includes(state)) Object.assign(order, { status: state.toUpperCase(), deliveryState: state.toUpperCase(), paymentStatus: state === "refunded" ? "REFUNDED" : state.toUpperCase(), paidAt: null });
  return <main className="storefront-main order-detail-page page-width"><nav aria-label="Status preview" style={{ display:"flex", flexWrap:"wrap", gap:12, marginBottom:20, fontSize:12 }}>{["delivered","ready","pending","waiting","expired","refunded","cancelled"].map(item => <a key={item} href={`?state=${item}`}>{item}</a>)}</nav><OrderDetailView order={order} /></main>;
}
