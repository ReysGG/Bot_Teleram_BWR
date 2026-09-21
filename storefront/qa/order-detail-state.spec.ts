import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { OrderDetailView, orderPresentation } from "../src/components/orders/order-detail-view";
import { OrderPaymentPanel } from "../src/components/orders/order-payment-panel";
import { previewOrder } from "./dev/order-detail-preview";

vi.mock("@/lib/test-payments", () => ({ localTestPaymentsAllowed: () => false }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: { children: React.ReactNode }) => createElement("a", props, children) }));
vi.mock("next/image", () => ({ default: ({ src, alt, width, height }: { src: string; alt: string; width: number; height: number }) => createElement("img", { src, alt, width, height }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@clerk/nextjs", () => ({ useClerk: () => ({}) }));

it("never promises downloadable products when a paid order is waiting for stock", () => {
  const order = { ...previewOrder, status: "PAID_WAITING_STOCK", deliveryState: "PROCESSING" as const, deliveredFiles: 0, deliveries: [] };
  expect(orderPresentation(order).title).toContain("Menunggu ketersediaan");
  const payment = renderToStaticMarkup(createElement(OrderPaymentPanel, { order }));
  expect(payment).toContain("file belum tersedia");
  const page = renderToStaticMarkup(createElement(OrderDetailView, { order }));
  expect(page).not.toContain('href="#order-products"');
  expect(page).not.toContain('id="codex-login-title"');
});

it("gives closed status precedence over an old paid flag and hides download actions", () => {
  for (const status of ["EXPIRED", "CANCELLED", "REFUNDED"]) {
    const order = { ...previewOrder, status };
    expect(orderPresentation(order).tone).toBe("closed");
    const page = renderToStaticMarkup(createElement(OrderDetailView, { order }));
    expect(page).not.toContain('href="#order-products"');
    expect(page).not.toContain('id="order-products"');
  }
});

it("removes obsolete payment deadlines and redundant payment panels from delivered orders", () => {
  const page = renderToStaticMarkup(createElement(OrderDetailView, { order: previewOrder }));
  expect(page).toContain("File produkmu");
  expect(page).toContain("Pernah diunduh");
  expect(page).not.toContain("Batas pembayaran");
  expect(page).not.toContain("payment-instruction-panel");
});
