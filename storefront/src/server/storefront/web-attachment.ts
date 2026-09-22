import { prisma } from "@/server/db/prisma";
import { decryptProductAttachment } from "@/server/products/attachment";
import { canAccessWebProductResources } from "@/server/storefront/product-resource-access";

export async function downloadWebProductAttachment(input: {
  customerId: string;
  invoiceNumber: string;
  productId: string;
}) {
  const item = await prisma.orderItem.findFirst({
    where: {
      productId: input.productId,
      order: {
        invoiceNumber: input.invoiceNumber.trim().toUpperCase(),
        webCustomerId: input.customerId,
      },
    },
    select: {
      order: {
        select: {
          channel: true,
          paymentStatus: true,
          status: true,
        },
      },
      product: {
        select: {
          attachmentOriginalFilename: true,
          attachmentMimeType: true,
          attachmentEncryptedPayload: true,
          attachmentEncryptionIv: true,
          attachmentEncryptionTag: true,
        },
      },
    },
  });
  if (!item || !canAccessWebProductResources({
    channel: item.order.channel,
    paymentStatus: item.order.paymentStatus,
    orderStatus: item.order.status,
  })) {
    return null;
  }
  const product = item?.product;
  if (
    !product?.attachmentOriginalFilename ||
    !product.attachmentEncryptedPayload ||
    !product.attachmentEncryptionIv ||
    !product.attachmentEncryptionTag
  ) {
    return null;
  }
  return {
    filename: product.attachmentOriginalFilename,
    contentType: product.attachmentMimeType || "application/octet-stream",
    content: decryptProductAttachment({
      attachmentEncryptedPayload: product.attachmentEncryptedPayload,
      attachmentEncryptionIv: product.attachmentEncryptionIv,
      attachmentEncryptionTag: product.attachmentEncryptionTag,
    }),
  };
}
