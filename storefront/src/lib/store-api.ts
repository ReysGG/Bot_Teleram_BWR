import type { OrderPagination } from "./order-pagination";
import {
  StoreApiError,
  storeApiFetch,
  storeApiRequest,
} from "@/lib/telegram-store-api";
import type {
  StorefrontAccessResponse,
  StorefrontCheckoutResponse,
  StorefrontOrderDetail,
  StorefrontOrderSummary,
} from "@/lib/store-api-contract";

export type StorefrontAccount = {
  ok: true;
  customer: { contactMasked: string };
  wallet: {
    balance: number; walletEnabled: boolean; mixedQrisEnabled: boolean;
    transactions: Array<{ id: string; type: string; amount: number; balanceAfter: number; createdAt: string; invoiceNumber: string | null }>;
    nextCursor: string | null;
  };
};

export function loadStorefrontAccount(token: string, cursor?: string) {
  return storeApiRequest<StorefrontAccount>("/api/storefront/v1/account" + (cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""), { headers: { authorization: "Bearer " + token } });
}

export function connectStorefrontAccount(token: string, legacyPassword?: string) {
  return storeApiRequest<{ ok: true }>("/api/storefront/v1/account", {
    method: "POST", headers: { authorization: "Bearer " + token }, body: JSON.stringify({ legacyPassword }),
  });
}

export function createClerkCheckout(token: string, input: { productId: string; quantity: number; paymentMethod: string; idempotencyKey: string }) {
  return storeApiRequest<{ ok: true; order: StorefrontOrderDetail }>("/api/storefront/v1/account/checkouts", {
    method: "POST", headers: { authorization: "Bearer " + token }, body: JSON.stringify(input),
  });
}

export async function authenticateOrderAccess(input: {
  identifier: string;
  password: string;
  userAgent?: string | null;
}) {
  return storeApiRequest<StorefrontAccessResponse>("/api/storefront/v1/access", {
    method: "POST",
    body: JSON.stringify({ identifier: input.identifier, password: input.password }),
    headers: input.userAgent ? { "x-storefront-user-agent": input.userAgent } : undefined,
  });
}

export async function createStorefrontCheckout(input: {
  email: string;
  password: string;
  productId: string;
  quantity: number;
  paymentMethod: string;
  idempotencyKey: string;
  userAgent?: string | null;
}) {
  return storeApiRequest<StorefrontCheckoutResponse>("/api/storefront/v1/checkouts", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      productId: input.productId,
      quantity: input.quantity,
      paymentMethod: input.paymentMethod,
      idempotencyKey: input.idempotencyKey,
    }),
    headers: input.userAgent ? { "x-storefront-user-agent": input.userAgent } : undefined,
  });
}

export async function loadCustomerOrders(sessionToken: string, params: { page?: string; q?: string; status?: string } = {}) {
  return storeApiRequest<{
    ok: true;
    customer: { contactMasked: string; walletBalance: number };
    orders: StorefrontOrderSummary[]; pagination?: OrderPagination;
  }>("/api/storefront/v1/orders?" + new URLSearchParams({ page: params.page ?? "1", q: params.q ?? "", status: params.status ?? "all" }), {
    headers: { authorization: "Bearer " + sessionToken },
  });
}

export async function loadCustomerOrder(sessionToken: string, invoiceNumber: string) {
  return storeApiRequest<{ ok: true; order: StorefrontOrderDetail }>(
    "/api/storefront/v1/orders/" + encodeURIComponent(invoiceNumber),
    { headers: { authorization: "Bearer " + sessionToken } },
  );
}

export async function confirmLocalTestOrder(sessionToken: string, invoiceNumber: string) {
  return storeApiRequest<{ ok: true; order: StorefrontOrderDetail }>(
    "/api/storefront/v1/orders/" + encodeURIComponent(invoiceNumber) + "/test-confirm",
    {
      method: "POST",
      headers: { authorization: "Bearer " + sessionToken },
    },
  );
}

export async function loadCustomerOrderAsset(
  sessionToken: string,
  path: string,
) {
  const response = await storeApiFetch(path, {
    headers: { authorization: "Bearer " + sessionToken },
  });
  if (!response.ok) {
    let code = "request_failed";
    try {
      const payload = await response.clone().json() as { code?: unknown };
      if (typeof payload.code === "string") code = payload.code;
    } catch {
      // Binary proxy errors remain a stable status/code pair.
    }
    throw new StoreApiError(response.status, code);
  }
  return response;
}

export async function submitCustomerPaymentReference(
  sessionToken: string,
  invoiceNumber: string,
  value: string,
) {
  return storeApiRequest<{ ok: true; order: StorefrontOrderDetail }>(
    "/api/storefront/v1/orders/" + encodeURIComponent(invoiceNumber) + "/payment-reference",
    {
      method: "POST",
      body: JSON.stringify({ value }),
      headers: { authorization: "Bearer " + sessionToken },
    },
  );
}

export async function refreshCustomerPayment(
  sessionToken: string,
  invoiceNumber: string,
) {
  return storeApiRequest<{ ok: true; order: StorefrontOrderDetail }>(
    "/api/storefront/v1/orders/" + encodeURIComponent(invoiceNumber) + "/payment-refresh",
    {
      method: "POST",
      headers: { authorization: "Bearer " + sessionToken },
    },
  );
}

export async function revokeCustomerSession(sessionToken: string) {
  return storeApiRequest<{ ok: true }>("/api/storefront/v1/access/revoke", {
    method: "POST",
    headers: { authorization: "Bearer " + sessionToken },
  });
}

export async function cancelCustomerOrder(sessionToken: string, invoiceNumber: string) {
  return storeApiRequest<{ ok: true; order: StorefrontOrderDetail }>(
    "/api/storefront/v1/orders/" + encodeURIComponent(invoiceNumber) + "/cancel",
    { method: "POST", headers: { authorization: "Bearer " + sessionToken } },
  );
}
