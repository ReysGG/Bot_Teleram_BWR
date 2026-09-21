import { beforeEach, afterEach, expect, it, vi } from "vitest";
const provider = vi.hoisted(() => ({ services: vi.fn() }));
vi.mock("@/server/smspool/client", () => ({ getSmsPoolServices: provider.services }));
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(0); });
afterEach(() => vi.useRealTimers());
it("coalesces requests and preserves the full provider catalog", async () => {
  const rows = Array.from({ length: 1386 }, (_,i) => ({ ID:i+1,name:`Service ${i+1}`,favourite:0 }));
  provider.services.mockResolvedValue(rows);
  const { getCachedSmsPoolServices } = await import("@/server/smspool/service-catalog-cache");
  const [a,b] = await Promise.all([getCachedSmsPoolServices(),getCachedSmsPoolServices()]);
  expect(a).toHaveLength(1386); expect(b).toEqual(a); expect(provider.services).toHaveBeenCalledOnce();
  await getCachedSmsPoolServices(); expect(provider.services).toHaveBeenCalledOnce();
  vi.setSystemTime(300001); await getCachedSmsPoolServices(); expect(provider.services).toHaveBeenCalledTimes(2);
});
it("does not permanently cache a provider error", async () => {
  provider.services.mockRejectedValueOnce(new Error("temporary")).mockResolvedValueOnce([]);
  const { getCachedSmsPoolServices } = await import("@/server/smspool/service-catalog-cache");
  await expect(getCachedSmsPoolServices()).rejects.toThrow("temporary");
  await expect(getCachedSmsPoolServices()).resolves.toEqual([]); expect(provider.services).toHaveBeenCalledTimes(2);
});
