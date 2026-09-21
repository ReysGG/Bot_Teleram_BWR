import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { OrderTable } from "../src/components/orders/order-table";
import { PageHeading } from "../src/components/site/page-heading";
import type { StorefrontOrderSummary } from "../src/lib/store-api-contract";
vi.mock("next/link", () => ({ default: ({ children, prefetch: _prefetch, ...props }: { children: React.ReactNode; prefetch?: boolean }) => createElement("a", props, children) }));
vi.mock("next/image", () => ({ default: ({ src, alt, fill, width, height }: { src: string; alt: string; fill?: boolean; width?: number; height?: number }) => createElement("img", { src: "https://store.buildwithreys.com" + src, alt, width, height, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%" } : undefined }) }));
const sample: StorefrontOrderSummary = { id: "demo", invoiceNumber: "DEMO-ORDER-001", createdAt: "2026-09-16T01:00:00Z", expiresAt: "2026-09-16T01:05:00Z", paidAt: null, completedAt: null, status: "PENDING_PAYMENT", paymentStatus: "PENDING", paymentMethod: "QRIS", billedAmount: 567, grandTotal: 500, productName: "Produk digital contoh dengan judul panjang untuk pemeriksaan mobile", variantLabel: null, quantity: 1, deliveryState: "WAITING_PAYMENT", readyFiles: 0, deliveredFiles: 0 };
it("keeps invoice, amount, file status and detail link in the responsive order view", () => {
  const html = renderToStaticMarkup(createElement(OrderTable, { orders: [sample, { ...sample, id: "ready", invoiceNumber: "DEMO-ORDER-002", status: "PAID", paymentStatus: "PAID", deliveryState: "READY", readyFiles: 1 }] }));
  expect(html).toContain("DEMO-ORDER-001");
  expect(html).toContain('data-label="Total"');
  expect(html).toContain("Siap diambil");
  expect(html).toContain("/orders/DEMO-ORDER-002");
  // Isolated visual fixture; never bundled into the storefront or connected to an account.
  mkdirSync("storefront/design-review/fixtures", { recursive: true });
  const css = readFileSync("storefront/src/app/globals.css", "utf8");
  const heading = renderToStaticMarkup(createElement(PageHeading, { title: "Pantau pesananmu.", description: "Lihat status pembayaran dan ambil produk digitalmu dari satu tempat.", breadcrumbs: "Home / Pesanan", imageUrl: "/headings/orders-heading.png", imageAlt: "Ilustrasi pengelolaan pesanan digital", imageFit: "contain", imageTreatment: "natural" }));
  writeFileSync("storefront/design-review/fixtures/orders.html", `<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Preview daftar pesanan — data contoh</title><style>${css}</style><body><main class="orders-workspace">${heading}<div class="orders-workspace-content page-width"><p>Preview UI · Data contoh</p><section class="orders-list-card"><div class="orders-list-heading"><div><h2>Daftar pesanan</h2><p>Detail pembayaran dan produk tersedia pada masing-masing pesanan.</p></div></div>${html}</section></div></main></body></html>`);
});

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
