import type { ImgHTMLAttributes } from "react";
export default function Image({ fill, priority: _priority, unoptimized: _unoptimized, sizes: _sizes, style, ...props }: ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; priority?: boolean; unoptimized?: boolean }) {
  // The preview uses original local files; production keeps next/image optimization.
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  return <img {...props} style={{ ...(fill ? { position: "absolute", inset: 0, width: "100%", height: "100%" } : {}), ...style }} />;
}
