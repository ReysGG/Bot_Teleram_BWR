"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ProductCard } from "@/components/catalog/product-card";
import { Icon } from "@/components/ui/icon";
import type { StorefrontProduct } from "@/lib/catalog-types";

export function ProductCarousel({
  products,
  title,
}: {
  products: StorefrontProduct[];
  title: string;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const hovered = useRef(false);
  const lastInteraction = useRef(0);
  const direction = useRef(1);
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({
    active: false,
    moved: false,
    pointerId: -1,
    startScrollLeft: 0,
    startX: 0,
  });
  const [canMoveBack, setCanMoveBack] = useState(false);
  const [canMoveForward, setCanMoveForward] = useState(false);
  const [dragging, setDragging] = useState(false);

  const updateControls = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    setCanMoveBack(viewport.scrollLeft > 4);
    setCanMoveForward(
      viewport.scrollLeft + viewport.clientWidth < viewport.scrollWidth - 4,
    );
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    updateControls();
    const observer = new ResizeObserver(updateControls);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [products.length, updateControls]);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (products.length < 2) return;
    const timer = window.setInterval(() => {
      const viewport = viewportRef.current;
      if (!viewport || reduced.matches || hovered.current || dragRef.current.active ||
          document.visibilityState !== "visible" || shellRef.current?.contains(document.activeElement) ||
          Date.now() - lastInteraction.current < 8000 || viewport.scrollWidth <= viewport.clientWidth + 4) return;
      const rect = viewport.getBoundingClientRect();
      if (rect.bottom <= 0 || rect.top >= window.innerHeight) return;
      if (viewport.scrollLeft + viewport.clientWidth >= viewport.scrollWidth - 4) direction.current = -1;
      else if (viewport.scrollLeft <= 4) direction.current = 1;
      const width = viewport.firstElementChild?.getBoundingClientRect().width ?? 280;
      viewport.scrollBy({ left: direction.current * (width + 18), behavior: "smooth" });
    }, 4500);
    return () => window.clearInterval(timer);
  }, [products.length]);

  function move(direction: -1 | 1) {
    lastInteraction.current = Date.now();
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollBy({
      left: direction * Math.max(280, viewport.clientWidth * 0.82),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  }

  function startDrag(event: ReactPointerEvent<HTMLDivElement>) {
    lastInteraction.current = Date.now();
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    dragRef.current = {
      active: true,
      moved: false,
      pointerId: event.pointerId,
      startScrollLeft: viewport.scrollLeft,
      startX: event.clientX,
    };
  }

  function continueDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const viewport = viewportRef.current;
    const drag = dragRef.current;
    if (!viewport || !drag.active) return;
    const distance = event.clientX - drag.startX;
    if (Math.abs(distance) > 5) {
      if (!drag.moved) viewport.setPointerCapture(event.pointerId);
      drag.moved = true;
      setDragging(true);
    }
    if (!drag.moved) return;
    event.preventDefault();
    viewport.scrollLeft = drag.startScrollLeft - distance;
  }

  function finishDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const viewport = viewportRef.current;
    if (!dragRef.current.active) return;
    const moved = dragRef.current.moved;
    const pointerId = dragRef.current.pointerId;
    dragRef.current.active = false;
    if (viewport?.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
    if (moved) {
      window.setTimeout(() => {
        if (!dragRef.current.active && dragRef.current.pointerId === pointerId) {
          dragRef.current.moved = false;
        }
      }, 0);
    }
  }

  return (
    <>
      <div className="section-heading carousel-heading">
        <h2>{title}</h2>
        <Link href="/shop">Lihat semua <Icon aria-hidden="true" name="arrow-right" size={15} /></Link>
      </div>
      <div className="product-carousel-shell" ref={shellRef} onPointerEnter={() => { hovered.current = true; }} onPointerLeave={() => { hovered.current = false; }} onWheelCapture={() => { lastInteraction.current = Date.now(); }}>
        <div
          className={`product-carousel${dragging ? " is-dragging" : ""}`}
          onClickCapture={(event) => {
            if (!dragRef.current.moved) return;
            event.preventDefault();
            event.stopPropagation();
            dragRef.current.moved = false;
          }}
          onPointerCancel={finishDrag}
          onPointerDown={startDrag}
          onPointerMove={continueDrag}
          onPointerUp={finishDrag}
          onScroll={updateControls}
          ref={viewportRef}
          tabIndex={0}
        >
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
        <button
          aria-label="Geser ke produk sebelumnya"
          className="carousel-nav-button carousel-nav-previous"
          disabled={!canMoveBack}
          onClick={() => move(-1)}
          type="button"
        >
          <Icon aria-hidden="true" name="chevron-left" size={21} strokeWidth={2.4} />
        </button>
        <button
          aria-label="Geser ke produk berikutnya"
          className="carousel-nav-button carousel-nav-next"
          disabled={!canMoveForward}
          onClick={() => move(1)}
          type="button"
        >
          <Icon aria-hidden="true" name="chevron-right" size={21} strokeWidth={2.4} />
        </button>
      </div>
    </>
  );
}
