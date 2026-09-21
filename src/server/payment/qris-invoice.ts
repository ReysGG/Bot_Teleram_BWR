import { optionalEnv } from "@/server/env";
import {
  buildDynamicQrisPayloadForAttempt,
  resolveQrisCheckoutMerchant,
} from "@/server/payment/qris-merchant-service";
import {
  buildDynamicQrisPayload,
  createQrisPng,
  normalizeAndValidateStaticQrisPayload,
} from "@/server/payment/qris";

export type QrisInvoiceSnapshot = {
  merchantNameSnapshot: string;
  providerKeySnapshot: string;
  encryptedBasePayloadSnapshot: string;
  basePayloadEncryptionIvSnapshot: string;
  basePayloadEncryptionTagSnapshot: string;
  amount: number;
};

export type QrisCheckoutSummary = {
  ready: boolean;
  providerKey: string | null;
  merchantName: string | null;
};

/** Returns only safe presentation metadata; the encrypted QR payload stays server-side. */
export async function getQrisCheckoutSummary(): Promise<QrisCheckoutSummary> {
  try {
    const merchant = await resolveQrisCheckoutMerchant();
    return merchant
      ? {
          ready: true,
          providerKey: merchant.providerKey,
          merchantName: merchant.name,
        }
      : { ready: false, providerKey: null, merchantName: null };
  } catch {
    return { ready: false, providerKey: null, merchantName: null };
  }
}

export async function qrisCheckoutReady(): Promise<boolean> {
  return (await getQrisCheckoutSummary()).ready;
}

export async function renderQrisInvoice(input: {
  amount: number;
  attempt: QrisInvoiceSnapshot | null;
}): Promise<{
  png: Buffer;
  merchantName: string;
  providerKey: string;
  legacy: boolean;
}> {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
    throw new Error("Nominal invoice QRIS tidak valid");
  }

  if (input.attempt) {
    if (input.attempt.amount !== input.amount) {
      throw new Error("Snapshot invoice QRIS tidak cocok dengan nominal pembayaran");
    }
    const payload = buildDynamicQrisPayloadForAttempt(input.attempt);
    return {
      png: await createQrisPng(payload),
      merchantName: input.attempt.merchantNameSnapshot,
      providerKey: input.attempt.providerKeySnapshot,
      legacy: false,
    };
  }

  // Rows created before provider-aware QRIS retain the original DANA env
  // behavior. A snapshotted invoice never falls through to this legacy path.
  const legacyPayload = optionalEnv("PAYMENT_QRIS_BASE_PAYLOAD");
  if (!legacyPayload) {
    throw new Error("Snapshot invoice QRIS tidak ditemukan");
  }
  const payload = buildDynamicQrisPayload(
    normalizeAndValidateStaticQrisPayload(legacyPayload),
    input.amount,
  );
  return {
    png: await createQrisPng(payload),
    merchantName: "QRIS / DANA",
    providerKey: "DANA",
    legacy: true,
  };
}
