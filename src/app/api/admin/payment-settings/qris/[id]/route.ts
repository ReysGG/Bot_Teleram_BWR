import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { appRoute } from "@/server/env";
import { qrisAdminErrorCode } from "@/server/payment/qris-admin-route";
import { updateQrisMerchant } from "@/server/payment/qris-merchant-service";
import { assertAdminOrigin, requireAdminRequest } from "@/server/security/admin-auth";

const schema = z.object({
  slug: z.string().trim().min(1).max(64),
  name: z.string().trim().min(2).max(100),
  providerKey: z.string().trim().min(1).max(64),
  basePayload: z.string().trim().max(4096),
  enabled: z.enum(["true", "false"]).transform((value) => value === "true"),
  trustedDeviceId: z.string().trim().max(200),
  shopeeSessionId: z.string().trim().max(200).optional(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const detailPath = `/admin/payment-settings/qris/${encodeURIComponent(id)}`;
  try {
    assertAdminOrigin(request);
    const admin = requireAdminRequest(request);
    const form = await request.formData();
    const input = schema.parse({
      slug: form.get("slug"),
      name: form.get("name"),
      providerKey: form.get("providerKey"),
      basePayload: form.get("basePayload"),
      enabled: form.get("enabled"),
      trustedDeviceId: form.get("trustedDeviceId") ?? "",
      shopeeSessionId: form.get("shopeeSessionId") ?? undefined,
    });
    await updateQrisMerchant({
      id,
      slug: input.slug,
      name: input.name,
      providerKey: input.providerKey,
      ...(input.basePayload ? { basePayload: input.basePayload } : {}),
      enabled: input.enabled,
      trustedDeviceId: input.trustedDeviceId,
      ...(input.shopeeSessionId === undefined ? {} : { shopeeSessionId: input.shopeeSessionId }),
      actor: `admin:${admin.email}`,
    });
    return NextResponse.redirect(appRoute(`${detailPath}?notice=qris_updated`), 303);
  } catch (error) {
    return NextResponse.redirect(
      appRoute(`${detailPath}?error=${qrisAdminErrorCode(error)}`),
      303,
    );
  }
}
