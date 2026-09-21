import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: { alias: {
    "@": fileURLToPath(new URL("../storefront/src", import.meta.url)),
    "react": fileURLToPath(new URL("../node_modules/react", import.meta.url)),
    "react-dom": fileURLToPath(new URL("../node_modules/react-dom", import.meta.url)),
    "@clerk/nextjs": fileURLToPath(new URL("../storefront/node_modules/@clerk/nextjs/dist/cjs/index.js", import.meta.url)),
    "next/link": fileURLToPath(new URL("../node_modules/next/link.js", import.meta.url)),
    "next/image": fileURLToPath(new URL("../node_modules/next/image.js", import.meta.url)),
    "next/navigation": fileURLToPath(new URL("../node_modules/next/navigation.js", import.meta.url)),
  } },
  test: { environment: "happy-dom", include: ["storefront/qa/cart-preview.spec.ts", "storefront/qa/orders-preview.spec.ts", "storefront/qa/add-button.spec.ts", "storefront/qa/claim-resources.spec.ts", "storefront/qa/order-reveal.spec.ts"] },
});
