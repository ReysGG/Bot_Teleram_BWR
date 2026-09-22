import type { NextRequest } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/server/db/prisma";
import {
  parseAdminProductInput,
} from "@/server/products/admin";
import { assertAdminOrigin, requireAdminRequest } from "@/server/security/admin-auth";
import {
  ProductAttachmentError,
  prepareProductAttachment,
  removedProductAttachment,
} from "@/server/products/attachment";
import {
  ProductImageError,
  prepareProductImage,
  removedProductImage,
} from "@/server/products/media";
import { ProductPostDeliveryInputError } from "@/server/products/post-delivery";
import { CatalogDescriptionInputError } from "@/server/products/catalog-description";
import { adminFormFailure, adminFormSuccess } from "@/server/admin/form-response";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  let errorCode = "product";
  try {
    assertAdminOrigin(request);
    requireAdminRequest(request);
    const form = await request.formData();
    const raw = Object.fromEntries(form);
    const parsedProduct = parseAdminProductInput(raw);
    const { imageUrl, ...product } = parsedProduct;
    const attachment = await prepareProductAttachment(form.get("attachment"));
    const attachmentUpdate = form.get("removeAttachment") === "on"
      ? removedProductAttachment()
      : attachment ?? {};
    const uploadedImage = await prepareProductImage(form.get("image"));
    const imageUpdate = form.get("removeImage") === "on"
      ? removedProductImage()
      : uploadedImage ?? (imageUrl ? { imageUrl } : {});

    await prisma.$transaction(async (tx) => {
      if (product.groupId) {
        const group = await tx.productGroup.findUnique({
          where: { id: product.groupId },
          select: { id: true },
        });
        if (!group) throw new Error("Product group not found");
      }
      await tx.product.update({
        where: { id },
        data: { ...product, ...imageUpdate, ...attachmentUpdate },
      });
    });
    return adminFormSuccess(
      request,
      `/admin/products/${id}/edit?notice=product-edited`,
    );
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
      return adminFormFailure(
        request,
        `/admin/products/${id}/edit?error=product`,
        "admin-session",
        401,
      );
    }
    if (error instanceof Error && error.message === "INVALID_ORIGIN") {
      return adminFormFailure(
        request,
        `/admin/products/${id}/edit?error=product`,
        "admin-origin",
        403,
      );
    }
    return adminFormFailure(
      request,
      `/admin/products/${id}/edit?error=${errorCode}`,
      errorCode,
      errorStatus,
    );
  }
}
