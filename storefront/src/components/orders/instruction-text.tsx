import { Fragment, type ReactNode } from "react";
import type { StorefrontOrderDetail } from "@/lib/store-api-contract";
type Entity = NonNullable<StorefrontOrderDetail["guidance"][number]["entities"]>[number];
export function safeGuidanceUrl(value?: string | null) {
  if (!value || value.length > 2048) return null;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.href : null; } catch { return null; }
}
export function InstructionText({ text, entities = [] }: { text: string; entities?: Entity[] }) {
  const ranges: Entity[] = entities.slice(0, 100).filter(e => Number.isInteger(e.offset) && Number.isInteger(e.length) && e.offset >= 0 && e.length > 0 && e.offset + e.length <= text.length);
  for (const match of text.matchAll(/https:\/\/[^\s<>"']+/g)) {
    let url = match[0].replace(/[.,;!?]+$/, "");
    while (url.endsWith(")") && url.split(")").length > url.split("(").length) url = url.slice(0, -1);
    const start = match.index;
    if (safeGuidanceUrl(url) && !ranges.some(e => ["text_link", "code"].includes(e.type) && e.offset < start + url.length && e.offset + e.length > start)) ranges.push({ type: "text_link", offset: start, length: url.length, url });
  }
  const boundaries = [...new Set([0, text.length, ...ranges.flatMap(e => [e.offset, e.offset + e.length])])].sort((a, b) => a - b);
  return <div className="order-instruction-text">{boundaries.slice(0, -1).map((start, index) => {
    const end = boundaries[index + 1];
    const active = ranges.filter(e => e.offset <= start && e.offset + e.length >= end);
    let content: ReactNode = text.slice(start, end);
    for (const entity of active) {
      if (entity.type === "bold") content = <strong>{content}</strong>;
      if (entity.type === "italic") content = <em>{content}</em>;
      if (entity.type === "underline") content = <u>{content}</u>;
      if (entity.type === "strikethrough") content = <s>{content}</s>;
      if (entity.type === "code") content = <code>{content}</code>;
      if (entity.type === "blockquote") content = <span className="instruction-quote">{content}</span>;
      if (entity.type === "spoiler") content = <span className="instruction-highlight">{content}</span>;
    }
    const url = safeGuidanceUrl(active.find(e => e.type === "text_link")?.url);
    return <Fragment key={start}>{url ? <a href={url} target="_blank" rel="noopener noreferrer">{content}</a> : content}</Fragment>;
  })}</div>;
}
