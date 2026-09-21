import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { OrderResources } from "../src/components/orders/order-resources";
import { InstructionText } from "../src/components/orders/instruction-text";
it("renders a safe new-tab claim button even when there is no instruction text", () => {
  const html = renderToStaticMarkup(createElement(OrderResources, { invoiceNumber: "DEMO", guidance: [{ productId: "p", productName: "Demo", text: "", redeemUrl: "https://example.com/claim" }], attachments: [] }));
  expect(html).toContain('href="https://example.com/claim"'); expect(html).toContain('target="_blank"'); expect(html).toContain('rel="noopener noreferrer"');
});
it("preserves UTF-16 offsets, links and bold text without injecting HTML", () => {
  const text = "🎁 Panduan <script>alert(1)</script>";
  const html = renderToStaticMarkup(createElement(InstructionText, { text, entities: [{ type: "bold", offset: 3, length: 7 }, { type: "text_link", offset: 3, length: 7, url: "https://example.com/" }] }));
  expect(html).toContain('<strong>Panduan</strong>'); expect(html).toContain('href="https://example.com/"'); expect(html).not.toContain("<script>"); expect(html).toContain("&lt;script&gt;");
});
it("links bare HTTPS URLs but never javascript or credential-bearing links", () => {
  const html = renderToStaticMarkup(createElement(InstructionText, { text: "Buka https://example.com/guide. Tidak: https://user:pass@example.com/", entities: [{ type: "text_link", offset: 0, length: 4, url: "javascript:alert(1)" }] }));
  expect(html).toContain('href="https://example.com/guide"'); expect(html).not.toContain('href="javascript:'); expect(html).not.toContain('href="https://user:');
});
it("keeps invalid redeem links non-interactive and empty resources absent", () => {
  expect(renderToStaticMarkup(createElement(OrderResources, { invoiceNumber: "x", guidance: [], attachments: [] }))).toBe("");
  const html = renderToStaticMarkup(createElement(OrderResources, { invoiceNumber: "x", guidance: [{ productId: "p", productName: "Demo", text: "Panduan", redeemUrl: "data:text/html,test" }], attachments: [] }));
  expect(html).not.toContain("Buka tempat claim");
});
