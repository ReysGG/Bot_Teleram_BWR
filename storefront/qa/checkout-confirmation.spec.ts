import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => createElement("a", props, children) }));
vi.mock("@/components/catalog/product-artwork", () => ({ ProductArtwork: () => null }));
import { ProductCheckout } from "../src/components/checkout/product-checkout";
import type { StorefrontProduct } from "../src/lib/catalog-types";
it("requires explicit wallet confirmation, cancels without a request and blocks duplicate confirmation", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function(this: HTMLDialogElement) { this.open = true; });
  vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function(this: HTMLDialogElement) { this.open = false; });
  const nativeConfirm = vi.fn(); vi.stubGlobal("confirm", nativeConfirm);
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  let finish!: (response: Response) => void;
  const fetcher = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })); vi.stubGlobal("fetch", fetcher);
  try {
    await act(async () => root.render(createElement(ProductCheckout, {
      accountMode: true, initialQuantity: 2, account: { contactMasked: "de***@example.test", balance: 500, walletEnabled: true, mixedQrisEnabled: true }, paymentMethods: ["QRIS"],
      product: { id: "demo", slug: "demo", name: "Demo", price: 500, readyStock: 10, availability: "IN_STOCK", preorderEnabled: false } as StorefrontProduct,
    })));
    await act(async () => host.querySelector<HTMLInputElement>('input[value="Saldo + QRIS"]')!.click());
    const submit = async () => act(async () => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await submit();
    const dialog = host.querySelector("dialog")!;
    expect(dialog.open).toBe(true); expect(dialog.textContent).toContain("Saldo yang digunakan"); expect(fetcher).not.toHaveBeenCalled(); expect(nativeConfirm).not.toHaveBeenCalled();
    await act(async () => dialog.querySelectorAll("button")[0].click());
    expect(dialog.open).toBe(false); expect(fetcher).not.toHaveBeenCalled();
    await submit();
    await act(async () => { dialog.querySelectorAll("button")[1].click(); dialog.querySelectorAll("button")[1].click(); });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({ quantity: 2, paymentMethod: "WALLET_QRIS", productId: "demo" });
    await act(async () => finish(Response.json({ ok: true, order: { invoiceNumber: "DEMO-ONLY" } })));
    expect(router.push).toHaveBeenCalledWith("/orders/DEMO-ONLY");
  } finally { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); }
});
