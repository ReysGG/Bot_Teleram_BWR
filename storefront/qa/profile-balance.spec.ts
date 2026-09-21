import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ owner: "owner-one" }));
vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({ user: { id: state.owner, imageUrl: "", fullName: "Demo", primaryEmailAddress: { emailAddress: "demo@example.test" } } }),
  useClerk: () => ({ openUserProfile: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => createElement("a", props, children) }));
import { ProfileButton } from "../src/components/account/profile-button";
it("loads balance when opening the profile and never carries it into a different account", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const fetcher = vi.fn().mockResolvedValue(Response.json({ balance: 500 })); vi.stubGlobal("fetch", fetcher);
  try {
    await act(async () => root.render(createElement(ProfileButton)));
    expect(fetcher).not.toHaveBeenCalled();
    await act(async () => host.querySelector("button")!.click());
    expect(host.textContent).toMatch(/Saldo akunRp\s*500/);
    expect(host.querySelector("a")?.getAttribute("href")).toBe("/account/wallet");
    state.owner = "owner-two"; await act(async () => root.render(createElement(ProfileButton)));
    expect(host.textContent).not.toContain("500");
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});
