import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
const path = (value: string) => fileURLToPath(new URL(value, import.meta.url));
export default defineConfig({ test: { environment: "happy-dom", include: ["storefront/qa/order-detail-state.spec.ts", "storefront/qa/cart-login*.spec.ts", "storefront/qa/lazy-products.spec.ts", "storefront/qa/carousel-motion.spec.ts", "storefront/qa/checkout-confirmation.spec.ts", "storefront/qa/web-login.spec.ts", "storefront/qa/profile-balance.spec.ts", "storefront/qa/add-button.spec.ts", "storefront/qa/orders-preview.spec.ts"] },
  resolve: { alias: { "@": path("../src"), react: path("../../node_modules/react"), "react-dom": path("../../node_modules/react-dom") } },
});
