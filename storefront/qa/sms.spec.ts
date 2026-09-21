import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ userId: "owner-a", signedIn: true, push: vi.fn(), getToken: vi.fn() }));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: state.signedIn, userId: state.userId, getToken: state.getToken }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: state.push }) }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: { children: React.ReactNode }) => createElement("a", props, children) }));
vi.mock("next/image", () => ({ default: ({ src, alt }: { src: string; alt: string }) => createElement("img", { src, alt }) }));
import { SmsWorkspace } from "../src/components/sms/sms-workspace";
import { SmsOrders } from "../src/components/sms/sms-orders";
import { SmsServicePicker } from "../src/components/sms/sms-pickers";
import { smsBrandLogo } from "../src/lib/sms-brand";
let host: HTMLDivElement, root: Root; const fetchMock = vi.fn();
const catalog = { balance: 55000, walletEnabled: true, maintenance: false, services: [{id:1,name:"Demo service"}], countries: [{id:2,name:"Demo country",code:"US",price:7000,successRate:90}] };
const order = { id:"order",serviceName:"Demo service",countryName:"Demo country",price:7000,status:"COMPLETED",phoneNumber:"2025550147",otpCode:"246810",fullCode:null,createdAt:new Date().toISOString(),expiresAt:null,refundedAt:null };
const response = (data: unknown) => ({ ok: true, status: 200, json: async () => data });
beforeEach(() => {
  vi.clearAllMocks(); state.userId = "owner-a"; state.signedIn = true; state.getToken.mockResolvedValue("demo-token");
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async (_url, init) => response(init?.method === "POST" ? {order} : catalog));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function click(text: string) { const b=[...host.querySelectorAll("button")].find(x=>x.textContent?.includes(text)); expect(b).toBeTruthy(); await act(async()=>b!.click()); }
async function choose() {
  await act(async()=>root.render(createElement(SmsWorkspace)));
  await click("Demo service");
  await click("Demo country");
}
it("requires confirmation before charging and sends the displayed price with a stable request key", async () => {
  await choose(); await click("Beli nomor"); expect(fetchMock.mock.calls.filter(c=>c[1]?.method==="POST")).toHaveLength(0);
  expect(host.querySelector("dialog")?.open).toBe(true); await click("Ya, beli nomor");
  const body=JSON.parse(fetchMock.mock.calls.find(c=>c[1]?.method==="POST")![1].body);
  expect(body).toMatchObject({serviceId:1,countryId:2,expectedPrice:7000}); expect(body.idempotencyKey).toMatch(/^[a-f0-9-]{36}$/);
  expect(state.push).toHaveBeenCalledWith("/sms/orders/order");
});
it("disables buying when website funds are insufficient", async () => {
  fetchMock.mockResolvedValue(response({...catalog,balance:1000})); await choose();
  const buy=[...host.querySelectorAll("button")].find(x=>x.textContent?.includes("Beli nomor"))!;
  expect(buy.disabled).toBe(true); expect(host.textContent).toContain("belum cukup");
});
it("does not get stuck loading when the same service is selected again", async () => {
  await choose(); const calls=fetchMock.mock.calls.length;
  await click("Demo service");
  expect(fetchMock.mock.calls.length).toBe(calls);
  expect([...host.querySelectorAll("button")].find(x=>x.textContent?.includes("Beli nomor"))?.disabled).toBe(false);
});
it("asks signed-out visitors to log in and never requests customer data", async () => {
  state.signedIn=false; await act(async()=>root.render(createElement(SmsWorkspace)));
  expect(host.textContent).toContain("Masuk untuk mulai"); expect(fetchMock).not.toHaveBeenCalled();
});
it("clears the prior account's code immediately when switching users", async () => {
  fetchMock.mockResolvedValue(response({order})); await act(async()=>root.render(createElement(SmsOrders,{orderId:"order"})));
  expect(host.textContent).toContain("246810");
  state.userId="owner-b"; fetchMock.mockImplementation(()=>new Promise(()=>{}));
  await act(async()=>root.render(createElement(SmsOrders,{orderId:"order"})));
  expect(host.textContent).not.toContain("246810"); expect(host.textContent).not.toContain("2025550147");
});
it("searches every provider service while rendering at most 24 cards", async () => {
  const services=Array.from({length:1386},(_,i)=>({id:i+1,name:`Service ${i+1}`})); const change=vi.fn();
  await act(async()=>root.render(createElement(SmsServicePicker,{services,value:0,onChange:change})));
  expect(host.querySelectorAll('button[aria-pressed]')).toHaveLength(24);
  await click("Berikutnya"); expect(host.textContent).toContain("Service 25");
  await act(async()=>{const input=host.querySelector("input")!; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,"Service 1386"); input.dispatchEvent(new Event("input",{bubbles:true}));});
  expect(host.querySelectorAll('button[aria-pressed]')).toHaveLength(1); await click("Service 1386"); expect(change).toHaveBeenCalledWith(1386); expect(fetchMock).not.toHaveBeenCalled();
});
it("uses local brand logos and a safe fallback for unknown names", () => {
  expect(smsBrandLogo("OpenAI / ChatGPT")).toMatch(/^\/sms\/brands\/openai\.[a-f0-9]+\.svg$/);
  expect(smsBrandLogo("OpenAI")).toBe(smsBrandLogo("OpenAI / ChatGPT"));
  expect(smsBrandLogo("Google/Gmail")).toMatch(/\.png$/);
  expect(smsBrandLogo("constructor")).toBeNull(); expect(smsBrandLogo("Unknown demo brand")).toBeNull();
});
