import { prisma } from "@/server/db/prisma";
import { sha256 } from "@/server/security/crypto";
import { activePublicProductWhere } from "@/server/products/visibility";
import { telegramProductImageUrl } from "@/server/products/media";
import { productAvailabilityById } from "@/server/telegram/flows/catalog/availability";
import { getMaxOrderQuantity, resolveOrderQuantityCapacity } from "@/server/checkout/order-quantity";
import { maxOrderQuantityForUnitPrice } from "@/server/checkout/order-amount";
import { MAX_CART_PRODUCTS, WebCartError, webCartCommandSchema, type WebCartCommand } from "./cart-policy";

export async function readWebCart(customerId: string) {
  const cart = await prisma.$transaction(tx => tx.webCart.findUnique({ where: { webCustomerId: customerId }, include: { items: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: MAX_CART_PRODUCTS } } }), { isolationLevel: "RepeatableRead" });
  if (!cart) return { revision: 0, items: [] };
  const products = await prisma.product.findMany({
    where: { AND: [activePublicProductWhere(), { id: { in: cart.items.map(item => item.productId) } }] },
    select: { id: true, slug: true, name: true, price: true, imageUrl: true, preorderEnabled: true, preorderLimit: true,
      group: { select: { id: true, imageUrl: true } },
      _count: { select: { orderItems: { where: { stockItemId: null, order: { isPreorder: true, status: { in: ["PENDING_PAYMENT", "PAID_WAITING_STOCK"] } } } } } },
    },
  });
  const availability = await productAvailabilityById(products);
  return { revision: cart.revision, items: cart.items.map(item => {
    const product = products.find(value => value.id === item.productId);
    const stock = availability.get(item.productId);
    if (!product || !stock) return { id: item.productId, slug: "", name: "Produk tidak tersedia", price: 0, imageUrl: null, availability: "OUT_OF_STOCK" as const, quantity: item.quantity, canCheckout: false, maxQuantity: 0 };
    const capacity = resolveOrderQuantityCapacity({ readyStock: stock.availableUnits, reservedStock: stock.reservedUnits,
      preorderEnabled: product.preorderEnabled, preorderLimit: product.preorderLimit, activePreorders: product._count.orderItems,
      configuredMaximum: Math.min(getMaxOrderQuantity(), maxOrderQuantityForUnitPrice(product.price)),
    });
    return { id: product.id, slug: product.slug, name: product.name, price: product.price,
      imageUrl: telegramProductImageUrl({ productId: product.id, productImageUrl: product.imageUrl, group: product.group }),
      availability: stock.availability === "IN_STOCK" ? stock.availableUnits <= 5 ? "LOW_STOCK" as const : "IN_STOCK" as const : stock.availability === "PREORDER" ? "PREORDER" as const : "OUT_OF_STOCK" as const,
      quantity: item.quantity, canCheckout: item.quantity <= capacity.maxQuantity, maxQuantity: capacity.maxQuantity,
    };
  }) };
}

export async function mutateWebCart(customerId: string, input: WebCartCommand) {
  const command = webCartCommandSchema.parse(input);
  const payloadHash = sha256(JSON.stringify(command));
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`web_cart_${customerId}`}))`;
    const previous = await tx.webCartMutation.findUnique({ where: { webCustomerId_idempotencyKey: { webCustomerId: customerId, idempotencyKey: command.idempotencyKey } } });
    if (previous) {
      if (previous.payloadHash !== payloadHash) throw new WebCartError("cart_key_conflict");
      return;
    }
    const cart = await tx.webCart.findUnique({ where: { webCustomerId: customerId } });
    if ((cart?.revision ?? 0) !== command.expectedRevision) throw new WebCartError("cart_conflict");
    if (command.action === "add" || command.action === "set") {
      if (!await tx.product.findFirst({ where: activePublicProductWhere(command.productId), select: { id: true } })) throw new WebCartError("cart_product_unavailable");
      const item = await tx.webCartItem.findUnique({ where: { webCustomerId_productId: { webCustomerId: customerId, productId: command.productId } } });
      const quantity = command.action === "add" ? (item?.quantity ?? 0) + command.quantity : command.quantity;
      if (quantity > getMaxOrderQuantity()) throw new WebCartError("cart_quantity_invalid");
      if (!item && await tx.webCartItem.count({ where: { webCustomerId: customerId } }) >= MAX_CART_PRODUCTS) throw new WebCartError("cart_full");
      await tx.webCart.upsert({ where: { webCustomerId: customerId }, create: { webCustomerId: customerId }, update: {} });
      await tx.webCartItem.upsert({ where: { webCustomerId_productId: { webCustomerId: customerId, productId: command.productId } }, create: { webCustomerId: customerId, productId: command.productId, quantity }, update: { quantity } });
    } else {
      await tx.webCart.upsert({ where: { webCustomerId: customerId }, create: { webCustomerId: customerId }, update: {} });
      await tx.webCartItem.deleteMany({ where: { webCustomerId: customerId, ...(command.action === "remove" ? { productId: command.productId } : {}) } });
    }
    await tx.webCart.update({ where: { webCustomerId: customerId }, data: { revision: { increment: 1 } } });
    await tx.webCartMutation.create({ data: { webCustomerId: customerId, idempotencyKey: command.idempotencyKey, payloadHash } });
    await tx.webCartMutation.deleteMany({ where: { webCustomerId: customerId, createdAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60_000) } } });
  });
  return readWebCart(customerId);
}
