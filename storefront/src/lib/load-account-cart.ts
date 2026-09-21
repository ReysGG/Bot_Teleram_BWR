import type { CartSnapshot } from "./cart-api-types";

type CartResult = { ok: true; cart: CartSnapshot } | { ok: false; code: string };

// Provision new Web accounts through the existing authenticated POST command.
// Never create customers during a GET or bypass proof for an existing account.
export async function loadAccountCart(options: {
  allowSetup: boolean;
  isCurrent: () => boolean;
  onSetupStarted: () => void;
  onPrepared: () => void;
  authorization?: (fresh?: boolean) => Promise<string | null>;
  request?: typeof fetch;
}): Promise<CartResult> {
  const request = options.request ?? fetch;
  const withAuthorization = async (init: RequestInit, fresh = false) => {
    const authorization = await options.authorization?.(fresh);
    const headers = new Headers(init.headers);
    if (authorization) headers.set("authorization", authorization);
    return { ...init, headers };
  };
  const read = async (fresh = false) => {
    const response = await request("/api/cart", await withAuthorization({ cache: "no-store", signal: AbortSignal.timeout(12000) }, fresh));
    const data = await response.json() as { ok?: boolean; code?: string; cart?: CartSnapshot };
    return { response, data };
  };
  let usingFreshToken = false;
  let { response, data } = await read();
  if (response.status === 401 && data.code === "sign_in_required" && options.authorization) {
    usingFreshToken = true;
    ({ response, data } = await read(usingFreshToken));
  }
  if (!options.isCurrent()) return { ok: false, code: "account_changed" };
  if (response.status === 409 && data.code === "account_setup_required" && options.allowSetup) {
    options.onSetupStarted();
    const connected = await request("/api/customer/account", await withAuthorization({
      method: "POST", headers: { "content-type": "application/json" }, body: "{}",
      signal: AbortSignal.timeout(12000),
    }, usingFreshToken));
    const result = await connected.json() as { ok?: boolean; code?: string };
    if (!options.isCurrent()) return { ok: false, code: "account_changed" };
    if (!connected.ok || !result.ok) return { ok: false, code: result.code ?? "account_unavailable" };
    options.onPrepared();
    ({ response, data } = await read(usingFreshToken));
    if (!options.isCurrent()) return { ok: false, code: "account_changed" };
  }
  if (!response.ok || !data.ok || !data.cart) return { ok: false, code: data.code ?? "cart_unavailable" };
  return { ok: true, cart: data.cart };
}
