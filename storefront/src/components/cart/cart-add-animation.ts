const CART_TARGET_SELECTOR = "[data-cart-animation-target]";
const PULSE_CLASS = "is-cart-receiving";
const PULSE_DURATION_MS = 760;
const FLIGHT_DURATION_MS = 640;

const pulseTimers = new WeakMap<HTMLElement, number>();

function pulseCart(target: HTMLElement) {
  const previousTimer = pulseTimers.get(target);
  if (previousTimer) window.clearTimeout(previousTimer);

  target.classList.remove(PULSE_CLASS);
  void target.offsetWidth;
  target.classList.add(PULSE_CLASS);

  const timer = window.setTimeout(() => {
    target.classList.remove(PULSE_CLASS);
    pulseTimers.delete(target);
  }, PULSE_DURATION_MS);
  pulseTimers.set(target, timer);
}

function findSourceRect(source: HTMLElement): DOMRect {
  const productSurface = source.closest(".product-card, .product-detail");
  const artwork = productSurface?.querySelector<HTMLElement>(".product-artwork");
  return artwork?.getBoundingClientRect() ?? source.getBoundingClientRect();
}

export function animateCartAddition({
  imageUrl,
  source,
}: {
  imageUrl?: string | null;
  source: HTMLElement;
}) {
  if (source.closest("[data-no-motion]")) return;
  const cartTarget = document.querySelector<HTMLElement>(CART_TARGET_SELECTOR);
  if (!cartTarget) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion) {
    pulseCart(cartTarget);
    return;
  }

  const sourceRect = findSourceRect(source);
  const targetRect = cartTarget.getBoundingClientRect();
  const startSize = Math.min(82, Math.max(56, sourceRect.width * 0.3));
  const startLeft = sourceRect.left + (sourceRect.width - startSize) / 2;
  const startTop = sourceRect.top + (sourceRect.height - startSize) / 2;
  const targetLeft = targetRect.left + targetRect.width / 2 - startSize / 2;
  const targetTop = targetRect.top + targetRect.height / 2 - startSize / 2;
  const deltaX = targetLeft - startLeft;
  const deltaY = targetTop - startTop;

  const flyingItem = document.createElement("img");
  flyingItem.alt = "";
  flyingItem.className = "cart-flying-item";
  flyingItem.src = imageUrl || "/placeholders/product-fallback.webp";
  flyingItem.addEventListener("error", () => {
    flyingItem.src = "/placeholders/product-fallback.webp";
  }, { once: true });
  flyingItem.style.left = `${startLeft}px`;
  flyingItem.style.top = `${startTop}px`;
  flyingItem.style.width = `${startSize}px`;
  flyingItem.style.height = `${startSize}px`;
  document.body.appendChild(flyingItem);

  if (typeof flyingItem.animate !== "function") {
    flyingItem.remove();
    pulseCart(cartTarget);
    return;
  }

  const pulseTimer = window.setTimeout(() => pulseCart(cartTarget), FLIGHT_DURATION_MS * 0.68);
  const flight = flyingItem.animate([
    {
      opacity: 0,
      transform: "translate3d(0, 12px, 0) scale(.72) rotate(0deg)",
    },
    {
      offset: 0.14,
      opacity: 1,
      transform: "translate3d(0, 0, 0) scale(1) rotate(-3deg)",
    },
    {
      offset: 0.56,
      opacity: 1,
      transform: `translate3d(${deltaX * 0.48}px, ${deltaY * 0.34 - 42}px, 0) scale(.78) rotate(6deg)`,
    },
    {
      opacity: 0.2,
      transform: `translate3d(${deltaX}px, ${deltaY}px, 0) scale(.18) rotate(12deg)`,
    },
  ], {
    duration: FLIGHT_DURATION_MS,
    easing: "cubic-bezier(.2,.75,.25,1)",
    fill: "forwards",
  });

  const cleanup = () => {
    window.clearTimeout(pulseTimer);
    flyingItem.remove();
  };
  flight.onfinish = cleanup;
  flight.oncancel = cleanup;
}
