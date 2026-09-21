import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import type { CartItem } from "../../src/lib/cart-api-types";
import type { StorefrontProduct } from "../../src/lib/catalog-types";
const initial: CartItem[] = [{ id: "demo-mail", slug: "demo-mail", name: "Mail Outlook/Hotmail (Random)", price: 500, imageUrl: null, quantity: 2, canCheckout: true, maxQuantity: 10, availability: "IN_STOCK" }];
function useDemoCart() {
  const [items, setItems] = useState(initial); const [pending, setPending] = useState(false); const busy = useRef(false);
  async function change(update: (items: CartItem[]) => CartItem[]) {
    if (busy.current) return false;
    busy.current = true; setPending(true);
    await new Promise(resolve => setTimeout(resolve, 800));
    setItems(update); busy.current = false; setPending(false); return true;
  }
  return { items, itemCount: items.reduce((n, i) => n + i.quantity, 0), subtotal: items.reduce((n, i) => n + i.quantity * i.price, 0), pending, hydrated: true, error: null, errorCode: null, retryRequired: false,
    add: (p: StorefrontProduct, quantity = 1) => change(list => list.some(i => i.id === p.id) ? list.map(i => i.id === p.id ? { ...i, quantity: Math.min(i.maxQuantity, i.quantity + quantity) } : i) : [...list, { id: p.id, slug: p.slug, name: p.name, price: p.price, imageUrl: p.imageUrl, quantity, availability: p.availability, canCheckout: true, maxQuantity: 10 }]),
    setQuantity: (id: string, quantity: number) => change(list => list.map(i => i.id === id ? { ...i, quantity: Math.max(1, Math.min(i.maxQuantity, quantity)) } : i)),
    remove: (id: string) => change(list => list.filter(i => i.id !== id)), clear: () => change(() => []), refresh: async () => {}, retry: async () => true,
  };
}
const Context = createContext<ReturnType<typeof useDemoCart> | null>(null);
export function CartProvider({ children }: { children: ReactNode }) { const cart = useDemoCart(); return <Context.Provider value={cart}>{children}</Context.Provider>; }
export function useCart() { const cart = useContext(Context); if (!cart) throw Error("Missing preview cart"); return cart; }
export type { CartItem } from "../../src/lib/cart-api-types";
