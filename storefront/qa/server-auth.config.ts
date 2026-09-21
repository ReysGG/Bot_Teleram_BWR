import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
const path = (value: string) => fileURLToPath(new URL(value, import.meta.url));
export default defineConfig({
  test: { environment: "node", include: ["storefront/qa/request-token.spec.ts"] },
  resolve: { alias: {
    "server-only": path("../node_modules/server-only/empty.js"),
    "@clerk/nextjs/server": path("../node_modules/@clerk/nextjs/dist/esm/server/index.js"),
    "next/headers": path("../node_modules/next/headers.js"),
  } },
});
