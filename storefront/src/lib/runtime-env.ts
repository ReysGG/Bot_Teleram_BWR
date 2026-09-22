export type AppEnvironment = "local" | "test" | "production";
export function appEnvironment(): AppEnvironment { const value = process.env.APP_ENV?.trim().toLowerCase(); return value === "production" ? "production" : value === "test" ? "test" : "local"; }
export function isLocalPreview() { return appEnvironment() !== "production" && process.env.STOREFRONT_PREVIEW_MODE === "true"; }
export function requireProductionEnv(name: string) { if (appEnvironment() !== "production") return process.env[name]?.trim() || undefined; const value=process.env[name]?.trim(); if(!value) throw new Error(`${name} must be configured when APP_ENV=production`); return value; }
