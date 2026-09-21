import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), origin: vi.fn(), download: vi.fn() }));
vi.mock("@/server/security/admin-auth", () => ({ requireAdminRequest: mocks.auth, assertAdminOrigin: mocks.origin }));
vi.mock("@/server/stock/admin-takeout", () => ({ AdminTakeoutError: class extends Error {}, downloadAdminStock: mocks.download }));
import { POST } from "@/app/api/admin/inventory/[id]/takeout/route";
const request = (mode = "bundle") => new NextRequest("https://store.example/api/admin/inventory/stock/takeout", { method: "POST", body: new URLSearchParams({ mode, archive: "true" }) });
const context = { params: Promise.resolve({ id: "stock" }) };
beforeEach(() => vi.resetAllMocks());
it.each(["auth", "origin"] as const)("blocks invalid %s before reading stock", async (name) => {
  mocks[name].mockImplementation(() => { throw new Error("blocked"); });
  expect((await POST(request(), context)).status).toBe(401);
  expect(mocks.download).not.toHaveBeenCalled();
});
it("rejects unknown download modes", async () => {
  expect((await POST(request("unknown"), context)).status).toBe(400);
  expect(mocks.download).not.toHaveBeenCalled();
});
it("returns a private attachment and wipes the source buffer", async () => {
  const file = Buffer.from("synthetic-credential");
  mocks.download.mockResolvedValue({ file, filename: "email.txt" });
  const response = await POST(request("email"), context);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("content-disposition")).toContain("attachment");
  expect(await response.text()).toBe("synthetic-credential");
  expect(file.every((byte) => byte === 0)).toBe(true);
  expect(mocks.download).toHaveBeenCalledWith("stock", "email", true);
});
