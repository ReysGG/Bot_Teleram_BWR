"use client";

import { useAuth, useClerk } from "@clerk/nextjs";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { StorefrontProduct } from "@/lib/catalog-types";
import { productCanEnterCart } from "@/lib/catalog-types";
import { animateCartAddition } from "@/components/cart/cart-add-animation";
import { beginCartIntent } from "@/lib/pending-cart-intent";
import { useCart } from "@/components/cart/cart-context";
import { useLocalPreview } from "@/components/auth/local-preview-context";

export function AddToCartButton({
  product,
  compact = false,
  iconOnly = false,
}: {
  product: StorefrontProduct;
  compact?: boolean;
  iconOnly?: boolean;
}) {
  const preview = useLocalPreview();
  if (preview) return <button className={"add-cart-button" + (compact ? " is-compact" : "")} disabled title="Pembelian dinonaktifkan pada pratinjau lokal">{iconOnly ? <Icon name="cart" size={17}/> : "Pratinjau"}</button>;
  return <AuthenticatedAddToCartButton product={product} compact={compact} iconOnly={iconOnly}/>;
}
function AuthenticatedAddToCartButton({product,compact,iconOnly}:{product:StorefrontProduct;compact:boolean;iconOnly:boolean}) {
  const { add, hydrated, pending, retryRequired, error, errorCode } = useCart();
  const [adding, setAdding] = useState(false);
  const { isLoaded, isSignedIn } = useAuth();
  const clerk = useClerk();
  const unavailable = !productCanEnterCart(product);
  const disabled = unavailable || !isLoaded || (isSignedIn && !hydrated) || pending || retryRequired;
  const needsAccount = ["account_setup_required", "account_link_required", "email_verification_required", "invalid_credentials"].includes(errorCode ?? "");
  if (isLoaded && isSignedIn && !hydrated && error) {
    return <Link className={"add-cart-button" + (compact ? " is-compact" : "")} href={needsAccount ? "/account" : "/cart"} title={error}>
      <Icon name="cart" size={17} aria-hidden="true" />{!iconOnly ? needsAccount ? "Lengkapi akun" : "Buka keranjang" : null}
    </Link>;
  }
  return (
    <button
      className={"add-cart-button" + (compact ? " is-compact" : "")}
      disabled={disabled}
      aria-busy={adding}
      data-waiting={pending && !adding && !unavailable ? "true" : undefined}
      aria-label={iconOnly ? `Tambah ${product.name} ke keranjang` : undefined}
      title={iconOnly ? `Tambah ${product.name} ke keranjang` : undefined}
      type="button"
      onClick={async (event) => {
        const source = event.currentTarget;
        if (!isLoaded || pending || adding) return;
        if (!isSignedIn) {
          const target = beginCartIntent(product);
          clerk.openSignIn({ forceRedirectUrl: target, signUpForceRedirectUrl: target });
          return;
        }
        setAdding(true);
        try {
          if (await add(product) && source.isConnected) animateCartAddition({ imageUrl: product.imageUrl, source });
        } finally { setAdding(false); }
      }}
    >
      <Icon aria-hidden="true" name={iconOnly ? "plus" : "cart"} size={17} strokeWidth={2.2} />
      {!iconOnly ? unavailable ? "Habis" : adding ? "Menambahkan..." : !isLoaded || (isSignedIn && !hydrated) ? "Memuat..." : compact ? "Tambah" : "Tambah ke keranjang" : null}
    </button>
  );
}
