"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function adminSearchHref(
  action: string,
  currentUrl: string,
  entries: Iterable<[string, FormDataEntryValue]>,
): string {
  const target = new URL(action, currentUrl);
  target.search = "";
  for (const [name, value] of entries) {
    if (typeof value !== "string" || !value.trim()) continue;
    target.searchParams.append(name, value);
  }
  return `${target.pathname}${target.search}${target.hash}`;
}

export function AdminSearchNavigation() {
  const router = useRouter();

  useEffect(() => {
    function submitWithoutScroll(event: SubmitEvent) {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (!form.matches("form.admin-search-form") || form.method.toLowerCase() !== "get") {
        return;
      }
      event.preventDefault();
      router.push(
        adminSearchHref(form.action, window.location.href, new FormData(form).entries()),
        { scroll: false },
      );
    }

    function resetWithoutScroll(event: MouseEvent) {
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest("form.admin-search-form a");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const target = new URL(anchor.href, window.location.href);
      if (target.origin !== window.location.origin) return;
      event.preventDefault();
      router.push(`${target.pathname}${target.search}${target.hash}`, { scroll: false });
    }

    document.addEventListener("submit", submitWithoutScroll, true);
    document.addEventListener("click", resetWithoutScroll, true);
    return () => {
      document.removeEventListener("submit", submitWithoutScroll, true);
      document.removeEventListener("click", resetWithoutScroll, true);
    };
  }, [router]);

  return null;
}
