import type { NextRequest } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { ZodError } from "zod";
import { prisma } from "@/server/db/prisma";
import { parseProductStatus } from "@/server/products/admin";
import {
  productStatusNotice,
  resolveProductAdminReturnTo,
} from "@/server/products/admin-navigation";
import { assertAdminOrigin, requireAdminRequest } from "@/server/security/admin-auth";
import { adminResultReturnPath } from "@/server/admin/return-path";
import { adminFormFailure, adminFormSuccess } from "@/server/admin/form-response";
import { lockInventoryAllocation } from "@/server/checkout/inventory-lock";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  let destination = "/admin/products";
  let failureDestination = "/admin/products";
  try {
    assertAdminOrigin(request);
    requireAdminRequest(request);
    const form = await request.formData();
    destination = resolveProductAdminReturnTo(form.get("returnTo"), id);
    failureDestination = resolveProductAdminReturnTo(
      form.get("failureReturnTo"),
      id,
    );
    const status = parseProductStatus(form.get("status"));
    await prisma.$transaction(async (tx) => {
      await lockInventoryAllocation(tx, id);
      await tx.product.update({ where: { id }, data: { status } });
    });
    return adminFormSuccess(
      request,
      adminResultReturnPath(
        destination,
        "notice",
        productStatusNotice(status),
      ),
    );
  } catch (error) {
    let errorCode = "product-status";
    let status = 500;
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      errorCode = "admin-session";
      status = 401;
    } else if (error instanceof Error && error.message === "INVALID_ORIGIN") {
      errorCode = "admin-origin";
      status = 403;
    } else if (error instanceof ZodError) {
      errorCode = "product-status-invalid";
      status = 422;
    } else if (
      error instanceof Prisma.PrismaClientKnownRequestError
      && error.code === "P2025"
    ) {
      errorCode = "product-not-found";
      status = 404;
    }
    return adminFormFailure(
      request,
      adminResultReturnPath(failureDestination, "error", errorCode),
      errorCode,
      status,
    );
  }
}
