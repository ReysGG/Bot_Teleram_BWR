import { prisma } from "@/server/db/prisma";
import { createDigitalOrder } from "@/server/checkout/create-order";
import {
  JAGO_ANDROID_PACKAGE,
  JAGO_TRANSFER_METHOD,
} from "@/server/payment/android-payment-provider";
import { getJagoTransferSetting } from "@/server/payment/jago-transfer-setting";

export {
  getJagoTransferSetting,
  normalizeJagoAccountNumber,
  setJagoTransferSetting,
  type JagoTransferSettingClient,
} from "@/server/payment/jago-transfer-setting";

export { JAGO_ANDROID_PACKAGE, JAGO_TRANSFER_METHOD };

export async function getJagoTransferCheckoutConfig() {
  const setting = await getJagoTransferSetting();
  return {
    enabled: setting.enabled,
    accountNumber: setting.accountNumber,
    accountNumberSource: setting.accountNumberSource,
  };
}

export async function createJagoTransferOrder(input: {
  chatId: string;
  buyerEmail?: string | null;
  buyerUsername?: string | null;
  buyerDisplayName?: string | null;
  productId: string;
  idempotencyKey: string;
  quantity?: number;
}) {
  return createDigitalOrder({ ...input, paymentMethod: JAGO_TRANSFER_METHOD });
}

export async function getJagoTransferAttemptForOrder(input: {
  orderId: string;
  chatId?: string;
}) {
  const attempt = await prisma.jagoTransferAttempt.findFirst({
    where: {
      orderId: input.orderId,
      ...(input.chatId ? { order: { chatId: input.chatId } } : {}),
    },
    include: {
      order: {
        include: {
          payment: true,
          items: { orderBy: { createdAt: "asc" } },
        },
      },
    },
  });
  if (!attempt) throw new Error("Instruksi transfer Bank Jago tidak ditemukan.");
  return attempt;
}
