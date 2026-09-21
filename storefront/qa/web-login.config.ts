import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
const path = (value: string) => fileURLToPath(new URL(value, import.meta.url));
export default defineConfig({
  test: { environment: "happy-dom", include: ["storefront/qa/web-login.spec.ts"] },
  resolve: { alias: { react: path("../../node_modules/react"), "react-dom": path("../../node_modules/react-dom") } },
});
