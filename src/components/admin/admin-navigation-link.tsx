"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ComponentProps } from "react";

/** Warm only a menu the operator intends to open, not every sidebar route. */
export function AdminNavigationLink(props: Omit<ComponentProps<typeof Link>, "prefetch">) {
  const [intent, setIntent] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function cancel() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return <Link {...props} prefetch={intent}
    onMouseEnter={(event) => {
      props.onMouseEnter?.(event);
      cancel();
      timer.current = setTimeout(() => { timer.current = null; setIntent(true); }, 120);
    }}
    onMouseLeave={(event) => { props.onMouseLeave?.(event); cancel(); setIntent(false); }}
    onFocus={(event) => { props.onFocus?.(event); setIntent(true); }}
    onBlur={(event) => { props.onBlur?.(event); cancel(); setIntent(false); }}
    onTouchStart={(event) => { props.onTouchStart?.(event); setIntent(true); }}
  />;
}
