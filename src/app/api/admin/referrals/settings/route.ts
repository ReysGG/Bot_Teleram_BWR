import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { appRoute } from "@/server/env";
import { setReferralProgramState } from "@/server/referral/service";
import { assertAdminOrigin, requireAdminRequest } from "@/server/security/admin-auth";

const schema = z.object({
  pointsPerJoin: z.coerce.number().int().min(1).max(1_000_000),
  claimThresholdPoints: z.coerce.number().int().min(1).max(1_000_000),
  claimRewardAmount: z.coerce.number().int().min(0).max(10_000_000),
  newUserReward: z.coerce.number().int().min(0).max(10_000_000),
});

export async function POST(request: NextRequest) {
  try {
    assertAdminOrigin(request);
    const admin = requireAdminRequest(request);
    const form = await request.formData();
    const input = schema.parse({
      pointsPerJoin: form.get("pointsPerJoin"),
      claimThresholdPoints: form.get("claimThresholdPoints"),
      claimRewardAmount: form.get("claimRewardAmount"),
      newUserReward: form.get("newUserReward"),
    });
    await setReferralProgramState({
      enabled: String(form.get("enabled") ?? "") === "true",
      ...input,
      actor: `admin:${admin.email}`,
    });
    return NextResponse.redirect(appRoute("/admin/referrals?notice=settings"), 303);
  } catch {
    return NextResponse.redirect(appRoute("/admin/referrals?error=settings"), 303);
  }
}
