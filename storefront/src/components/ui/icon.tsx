import type { SVGProps } from "react";

export type IconName =
  | "arrow-right"
  | "bolt"
  | "cart"
  | "check"
  | "chevron-left"
  | "chevron-right"
  | "circle"
  | "circle-check"
  | "cube"
  | "device-mobile"
  | "grid"
  | "home"
  | "mail"
  | "menu"
  | "minus"
  | "plus"
  | "phone"
  | "receipt"
  | "search"
  | "send"
  | "shield-check"
  | "sparkles"
  | "store"
  | "trash"
  | "user"
  | "wallet"
  | "clock"
  | "copy"
  | "x";

function IconGlyph({ name }: { name: IconName }) {
  switch (name) {
    case "wallet": return <><path d="M20 8V5H6a3 3 0 0 0 0 6h15v9H6a3 3 0 0 1-3-3V8" /><path d="M21 11h-6v5h6" /><path d="M17 13.5h.01" /></>;
    case "clock": return <><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 2" /></>;
    case "copy": return <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3" /></>;
    case "arrow-right":
      return <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>;
    case "bolt":
      return <path d="M13 2 4.8 13H11l-1 9 9.2-12H13l0-8Z" />;
    case "cart":
      return <><circle cx="9" cy="20" r="1" /><circle cx="19" cy="20" r="1" /><path d="M3 4h2l2.4 10.4A2 2 0 0 0 9.35 16h7.8a2 2 0 0 0 1.95-1.55L21 7H6" /></>;
    case "check":
      return <path d="m5 12 4 4L19 6" />;
    case "chevron-left":
      return <path d="m15 18-6-6 6-6" />;
    case "chevron-right":
      return <path d="m9 18 6-6-6-6" />;
    case "circle":
      return <circle cx="12" cy="12" r="9" />;
    case "circle-check":
      return <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.7 2.7L16.5 9" /></>;
    case "cube":
      return <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m4.5 7.8 7.5 4.3 7.5-4.3" /><path d="M12 12v9" /></>;
    case "device-mobile":
      return <><rect x="6" y="2.5" width="12" height="19" rx="2.5" /><path d="M10 18.5h4" /></>;
    case "grid":
      return <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>;
    case "home":
      return <><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" /></>;
    case "mail":
      return <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></>;
    case "menu":
      return <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>;
    case "minus":
      return <path d="M5 12h14" />;
    case "plus":
      return <><path d="M5 12h14" /><path d="M12 5v14" /></>;
    case "phone":
      return <path d="M7.3 3.6 9.7 7 8 9.1c1.4 2.8 3.5 4.9 6.3 6.3l2.1-1.7 3.4 2.4c.5.4.7 1 .5 1.6l-.5 2c-.2.8-.9 1.3-1.7 1.3C9.8 20.6 3.4 14.2 3 5.9c0-.8.5-1.5 1.3-1.7l2-.5c.4-.1.8-.1 1 .1Z" />;
    case "receipt":
      return <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 8h6" /><path d="M9 12h6" /><path d="M9 16h4" /></>;
    case "search":
      return <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>;
    case "send":
      return <><path d="m22 2-7 20-4-9-9-4 20-7Z" /><path d="M22 2 11 13" /></>;
    case "shield-check":
      return <><path d="M12 3 20 6v5c0 5.2-3.4 8.4-8 10-4.6-1.6-8-4.8-8-10V6l8-3Z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></>;
    case "sparkles":
      return <><path d="m12 3 1.4 3.6L17 8l-3.6 1.4L12 13l-1.4-3.6L7 8l3.6-1.4L12 3Z" /><path d="m19 14 .8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14Z" /><path d="m5 13 .7 1.8 1.8.7-1.8.7L5 18l-.7-1.8-1.8-.7 1.8-.7L5 13Z" /></>;
    case "store":
      return <><path d="M4 10v10h16V10" /><path d="m3 10 2-6h14l2 6" /><path d="M8 20v-6h8v6" /><path d="M3 10c0 2 3 3 5 0 1 2 3 2 4 0 1 2 3 2 4 0 2 3 5 2 5 0" /></>;
    case "user":
      return <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>;
    case "trash":
      return <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></>;
    case "x":
      return <><path d="m6 6 12 12" /><path d="M18 6 6 18" /></>;
  }
}

export function Icon({
  name,
  size = 20,
  strokeWidth = 2,
  ...props
}: Omit<SVGProps<SVGSVGElement>, "children"> & {
  name: IconName;
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <svg
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      viewBox="0 0 24 24"
      width={size}
      {...props}
    >
      <IconGlyph name={name} />
    </svg>
  );
}
