import {
  compareCheckoutAvailability,
  resolveCheckoutAvailability,
  type CheckoutAvailability,
} from "@/server/preorder/policy";
import { prisma } from "@/server/db/prisma";
import { sellableHealthFilter } from "./stock";

export type CatalogProductAvailabilityInput = {
  id: string;
  preorderEnabled: boolean;
  preorderLimit: number | null;
  _count: { orderItems: number };
};

export type CatalogProductAvailability = {
  availableUnits: number;
  reservedUnits: number;
  availability: CheckoutAvailability;
};

export function groupCatalogOffer(
  items: Array<{ price: number; availability: CheckoutAvailability }>,
) {
  const ranked = [...items].sort((left, right) =>
    compareCheckoutAvailability(left.availability, right.availability),
  );
  const availability = ranked[0]?.availability;
  if (!availability) return null;
  return {
    availability,
    price: Math.min(
      ...ranked
        .filter((item) => item.availability === availability)
        .map((item) => item.price),
    ),
  };
}

export async function productAvailabilityById(
  products: CatalogProductAvailabilityInput[],
) {
  const counts = products.length
    ? await prisma.digitalStockItem.groupBy({
        by: ["productId", "status"],
        where: {
          productId: { in: products.map((product) => product.id) },
          status: { in: ["AVAILABLE", "RESERVED"] },
          ...sellableHealthFilter(),
        },
        _count: { _all: true },
      })
    : [];
  const stock = new Map<string, { available: number; reserved: number }>();
  for (const row of counts) {
    const current = stock.get(row.productId) ?? { available: 0, reserved: 0 };
    if (row.status === "AVAILABLE") current.available = row._count._all;
    if (row.status === "RESERVED") current.reserved = row._count._all;
    stock.set(row.productId, current);
  }

  return new Map<string, CatalogProductAvailability>(
    products.map((product) => {
      const current = stock.get(product.id) ?? { available: 0, reserved: 0 };
      return [
        product.id,
        {
          availableUnits: current.available,
          reservedUnits: current.reserved,
          availability: resolveCheckoutAvailability({
            stockAvailable: current.available > 0,
            reservedUnits: current.reserved,
            preorderEnabled: product.preorderEnabled,
            preorderLimit: product.preorderLimit,
            activePreorders: product._count.orderItems,
          }),
        },
      ];
    }),
  );
}

export function availabilityEmoji(
  availability: CheckoutAvailability,
  maintenanceEnabled = false,
) {
  if (maintenanceEnabled) return "🔧";
  if (availability === "IN_STOCK") return "✅";
  if (availability === "PREORDER") return "📥";
  if (availability === "WAITING_CHECKOUT") return "⏳";
  if (availability === "PREORDER_FULL") return "🚫";
  return "❌";
}

export function availabilityButtonStyle(
  availability: CheckoutAvailability,
  maintenanceEnabled = false,
): "danger" | "success" | "primary" {
  if (maintenanceEnabled) return "danger";
  if (availability === "IN_STOCK") return "success";
  if (availability === "OUT_OF_STOCK" || availability === "PREORDER_FULL") {
    return "danger";
  }
  return "primary";
}
