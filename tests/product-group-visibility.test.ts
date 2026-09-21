import { describe, expect, it } from "vitest";
import { activePublicProductWhere } from "@/server/products/visibility";

describe("public product group visibility", () => {
  it("keeps standalone products public and fails closed for inactive parent groups", () => {
    expect(activePublicProductWhere("variant-id")).toEqual({
      id: "variant-id",
      status: "ACTIVE",
      OR: [
        { groupId: null },
        { group: { is: { status: "ACTIVE" } } },
      ],
    });
  });
});
