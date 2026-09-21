import type { AnchorHTMLAttributes } from "react";
import { navigate } from "./mock-navigation";
export default function Link({ href, prefetch: _prefetch, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean }) {
  return <a {...props} href={href} onClick={event => { onClick?.(event); if (!event.defaultPrevented && href.startsWith("/") && !event.metaKey && !event.ctrlKey) { event.preventDefault(); navigate(href); } }} />;
}
