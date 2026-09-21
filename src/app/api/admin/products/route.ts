import type { NextRequest } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/server/db/prisma";
import { assertAdminOrigin, requireAdminRequest } from "@/server/security/admin-auth";
import { slugify } from "@/server/utils/format";
import { parseAdminProductInput } from "@/server/products/admin";
import { productAnnouncementDedupeKey } from "@/server/telegram/delivery-key";
import {
  ProductAttachmentError,
  prepareProductAttachment,
} from "@/server/products/attachment";
import { ProductImageError, prepareProductImage } from "@/server/products/media";
import { fanoutBroadcastNotifications } from "@/server/telegram/broadcast-fanout";
import { ProductPostDeliveryInputError } from "@/server/products/post-delivery";
import { CatalogDescriptionInputError } from "@/server/products/catalog-description";
import { adminFormFailure, adminFormSuccess } from "@/server/admin/form-response";

function productCreateReturnTo(value: FormDataEntryValue | null) {
  const returnTo = String(value ?? "");
  if (returnTo === "/admin/products/new") return returnTo;
  return /^\/admin\/product-groups\/[A-Za-z0-9_-]+\/edit$/.test(returnTo)
    ? returnTo
    : "/admin/products";
}

export async function POST(request: NextRequest) {
  let errorReturnTo = "/admin/products";
  let errorCode = "product";
  try {
    assertAdminOrigin(request);
    requireAdminRequest(request);
    const form = await request.formData();
    errorReturnTo = productCreateReturnTo(form.get("returnTo"));
    const raw = Object.fromEntries(form);
    const input = parseAdminProductInput(raw);
    const attachment = await prepareProductAttachment(form.get("attachment"));
    const image = await prepareProductImage(form.get("image"));
    const baseSlug = slugify(input.name);
    const productId = await prisma.$transaction(async (tx) => {
      let groupIsPublic = true;
      if (input.groupId) {
        const group = await tx.productGroup.findUnique({
          where: { id: input.groupId },
          select: { id: true, status: true },
        });
        if (!group) throw new Error("Product group not found");
        groupIsPublic = group.status === "ACTIVE";
      }
      const product = await tx.product.create({
        data: {
          slug: `${baseSlug}-${Date.now().toString(36)}`,
          ...input,
          ...(image ?? {}),
          ...(attachment ?? {}),
        },
      });
      if (groupIsPublic) {
        await fanoutBroadcastNotifications({
          tx,
          notificationFor: (chatId) => ({
            dedupeKey: productAnnouncementDedupeKey(product.id, chatId),
            chatId,
            productId: product.id,
            kind: "PRODUCT_ANNOUNCEMENT",
            priority: 25,
          }),
        });
      }
      return product.id;
    });
    const destination = input.groupId && errorReturnTo === `/admin/product-groups/${input.groupId}/edit`
      ? `${errorReturnTo}?notice=variant-created`
      : `/admin/products/${productId}/edit?notice=product-created`;
    return adminFormSuccess(request, destination, 201);
  } catch (error) {
    let errorStatus = error instanceof ZodError ? 422 : 500;
    if (error instanceof ProductImageError) {
      errorCode = "product-image";
      errorStatus = 422;
    }
    if (error instanceof ProductAttachmentError) {
      errorCode = "product-attachment";
      errorStatus = 422;
    }
    if (error instanceof ProductPostDeliveryInputError) {
      errorCode = "product-post-delivery";
      errorStatus = 422;
    }
    if (error instanceof CatalogDescriptionInputError) {
      errorCode = "product-description";
      errorStatus = 422;
    }
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return adminFormFailure(request, `${errorReturnTo}?error=product`, "admin-session", 401);
    }
    if (error instanceof Error && error.message === "INVALID_ORIGIN") {
      return adminFormFailure(request, `${errorReturnTo}?error=product`, "admin-origin", 403);
    }
    return adminFormFailure(
      request,
      `${errorReturnTo}?error=${errorCode}`,
      errorCode,
      errorStatus,
    );
  }
}
