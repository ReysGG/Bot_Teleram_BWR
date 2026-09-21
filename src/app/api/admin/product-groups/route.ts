import type { NextRequest } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/server/db/prisma";
import { parseAdminProductGroupInput } from "@/server/products/group-admin";
import { assertAdminOrigin, requireAdminRequest } from "@/server/security/admin-auth";
import { slugify } from "@/server/utils/format";
import { CatalogDescriptionInputError } from "@/server/products/catalog-description";
import { adminFormFailure, adminFormSuccess } from "@/server/admin/form-response";

export async function POST(request: NextRequest) {
  try {
    assertAdminOrigin(request);
    requireAdminRequest(request);
    const form = await request.formData();
    const input = parseAdminProductGroupInput(Object.fromEntries(form));
    await prisma.productGroup.create({
      data: {
        ...input,
        slug: `${slugify(input.name)}-${Date.now().toString(36)}`,
      },
    });
    return adminFormSuccess(request, "/admin/product-groups?notice=group-created", 201);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return adminFormFailure(
        request,
        "/admin/product-groups/new?error=admin-session",
        "admin-session",
        401,
      );
    }
    if (error instanceof Error && error.message === "INVALID_ORIGIN") {
      return adminFormFailure(
        request,
        "/admin/product-groups/new?error=admin-origin",
        "admin-origin",
        403,
      );
    }
    const code = error instanceof CatalogDescriptionInputError ? "group-description" : "group";
    return adminFormFailure(
      request,
      `/admin/product-groups/new?error=${code}`,
      code,
      error instanceof CatalogDescriptionInputError || error instanceof ZodError ? 422 : 500,
    );
  }
}
