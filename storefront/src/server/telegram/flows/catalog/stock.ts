import { sellableStockWhere } from "@/server/stock/sellable";

export function sellableHealthFilter() {
  return sellableStockWhere();
}
