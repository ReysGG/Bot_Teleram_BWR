import type { CheckoutAvailability } from "@/server/preorder/policy";
import { prisma } from "@/server/db/prisma";
import { catalogDescriptionDocument } from "@/server/products/catalog-description";
import {
  telegramCatalogImageUrl,
  telegramProductImageUrl,
} from "@/server/products/media";
import { activePublicProductWhere } from "@/server/products/visibility";
import { soldUnitsByProduct } from "./sales-count";
import {
  groupCatalogOffer,
  productAvailabilityById,
} from "@/server/telegram/flows/catalog/availability";

type PublicAvailability = "IN_STOCK" | "LOW_STOCK" | "PREORDER" | "OUT_OF_STOCK";

function publicAvailability(
  availability: CheckoutAvailability,
  availableUnits: number,
): PublicAvailability {
  if (availability === "IN_STOCK") {
    return availableUnits <= 5 ? "LOW_STOCK" : "IN_STOCK";
  }
  if (availability === "PREORDER") return "PREORDER";
  return "OUT_OF_STOCK";
}

function publicDescription(description: string, entities: unknown, maximum: number) {
  return catalogDescriptionDocument({
    description,
    entities,
    maxLength: maximum,
  }).text;
}

function availabilityRank(value: PublicAvailability) {
  if (value === "IN_STOCK") return 0;
  if (value === "LOW_STOCK") return 1;
  if (value === "PREORDER") return 2;
  return 3;
}

export async function loadStorefrontCatalogSnapshot() {
  const [groups, products, runtime] = await Promise.all([
    prisma.productGroup.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        descriptionEntities: true,
        imageUrl: true,
        sortOrder: true,
      },
    }),
    prisma.product.findMany({
      where: activePublicProductWhere(),
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        slug: true,
        name: true,
        variantLabel: true,
        description: true,
        descriptionEntities: true,
        price: true,
        imageUrl: true,
        preorderEnabled: true,
        preorderEtaText: true,
        preorderLimit: true,
        groupSortOrder: true,
        createdAt: true,
        group: {
          select: {
            id: true,
            slug: true,
            name: true,
            imageUrl: true,
            sortOrder: true,
          },
        },
        _count: {
          select: {
            orderItems: {
              where: {
                stockItemId: null,
                order: {
                  isPreorder: true,
                  status: { in: ["PENDING_PAYMENT", "PAID_WAITING_STOCK"] },
                },
              },
            },
          },
        },
      },
    }),
    prisma.storeRuntimeSetting.findUnique({
      where: { id: "global" },
      select: {
        qrisDanaEnabled: true,
        walletCheckoutEnabled: true,
        usdtBep20Enabled: true,
        usdtBep20RecipientAddress: true,
        binanceInternalEnabled: true,
        binanceInternalRecipientId: true,
        jagoTransferEnabled: true,
        jagoTransferAccountNumber: true,
      },
    }),
  ]);

  const [availabilityByProduct, salesByProduct] = await Promise.all([
    productAvailabilityById(products),
    soldUnitsByProduct(products.map(product => product.id)),
  ]);
  const internalProducts = products.map((product) => {
    const stock = availabilityByProduct.get(product.id);
    if (!stock) throw new Error("Storefront product availability is missing");
    const availability = publicAvailability(stock.availability, stock.availableUnits);
    const groupImageUrl = product.group
      ? telegramCatalogImageUrl({
          kind: "group",
          id: product.group.id,
          imageUrl: product.group.imageUrl,
        })
      : null;
    return {
      groupId: product.group?.id ?? null,
      groupSortOrder: product.groupSortOrder,
      parentSortOrder: product.group?.sortOrder ?? 0,
      createdAt: product.createdAt,
      checkoutAvailability: stock.availability,
      public: {
        id: product.id,
        slug: product.slug,
        name: product.name,
        variantLabel: product.variantLabel,
        description: publicDescription(
          product.description,
          product.descriptionEntities,
          1_200,
        ),
        price: product.price,
        imageUrl: telegramProductImageUrl({
          productId: product.id,
          productImageUrl: product.imageUrl,
          group: product.group
            ? { id: product.group.id, imageUrl: product.group.imageUrl }
            : null,
        }),
        group: product.group
          ? {
              id: product.group.id,
              slug: product.group.slug,
              name: product.group.name,
              imageUrl: groupImageUrl,
            }
          : null,
        readyStock: stock.availableUnits,
        reservedStock: stock.reservedUnits,
        soldCount: salesByProduct.get(product.id) ?? 0,
        preorderEnabled: stock.availability === "PREORDER" && product.preorderEnabled,
        preorderEtaText: product.preorderEtaText,
        availability,
        featured: false,
        tags: [] as string[],
      },
    };
  });

  internalProducts.sort((left, right) =>
    availabilityRank(left.public.availability) - availabilityRank(right.public.availability) ||
    left.parentSortOrder - right.parentSortOrder ||
    left.groupSortOrder - right.groupSortOrder ||
    right.createdAt.getTime() - left.createdAt.getTime(),
  );
  const publicProducts = internalProducts.map((product, index) => ({
    ...product.public,
    featured: index < 5,
  }));

  const publicGroups = groups.map((group) => {
    const children = internalProducts.filter((product) => product.groupId === group.id);
    const offer = groupCatalogOffer(children.map((product) => ({
      price: product.public.price,
      availability: product.checkoutAvailability,
    })));
    return {
      id: group.id,
      slug: group.slug,
      name: group.name,
      description: publicDescription(group.description, group.descriptionEntities, 800),
      imageUrl: telegramCatalogImageUrl({
        kind: "group",
        id: group.id,
        imageUrl: group.imageUrl,
      }),
      productCount: children.length,
      availableCount: children.filter((product) =>
        product.public.availability !== "OUT_OF_STOCK",
      ).length,
      minPrice: offer?.price ?? null,
    };
  });

  const paymentMethods: string[] = [];
  if (runtime?.qrisDanaEnabled ?? true) paymentMethods.push("QRIS");
  if (runtime?.jagoTransferEnabled && runtime.jagoTransferAccountNumber) {
    paymentMethods.push("Bank Jago");
  }
  if (runtime?.binanceInternalEnabled && runtime.binanceInternalRecipientId) {
    paymentMethods.push("Binance Pay");
  }
  if (runtime?.usdtBep20Enabled && runtime.usdtBep20RecipientAddress) {
    paymentMethods.push("USDT BEP20");
  }

  return {
    source: "api" as const,
    generatedAt: new Date().toISOString(),
    groups: publicGroups,
    products: publicProducts,
    paymentMethods,
  };
}
