import { normalizeStoredProductPostDeliveryContent, safeStoredProductRedeemUrl } from "@/server/products/post-delivery";
import { canAccessWebProductResources } from "@/server/storefront/product-resource-access";

export function webProductGuidance(input: {
  channel: string; paymentStatus: string; orderStatus: string;
  items: Array<{ productId: string; productNameSnapshot: string; product: { postDeliveryInstructions: unknown; postDeliveryEntities: unknown; redeemUrl: unknown } }>;
}) {
  if (!canAccessWebProductResources(input)) return [];
  return [...new Map(input.items.flatMap(item => {
    const content = normalizeStoredProductPostDeliveryContent({ instructions: item.product.postDeliveryInstructions, entities: item.product.postDeliveryEntities });
    const redeemUrl = safeStoredProductRedeemUrl(item.product.redeemUrl);
    if (!content.instructions && !redeemUrl) return [];
    return [[item.productId, { productId: item.productId, productName: item.productNameSnapshot, text: content.instructions ?? "", entities: content.entities, redeemUrl }] as const];
  })).values()];
}
