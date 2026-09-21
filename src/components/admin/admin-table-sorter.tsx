"use client";

import { useEffect } from "react";

const NON_SORTABLE_HEADERS = new Set([
  "aksi",
  "action",
  "actions",
  "detail",
  "konfirmasi",
  "pilih",
]);

function normalized(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function numericValue(value: string): number | null {
  const normalizedValue = value
    .replace(/rp\s*/gi, "")
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(/,/g, ".");
  if (!/^-?\d+(?:\.\d+)?%?$/.test(normalizedValue)) return null;
  const parsed = Number.parseFloat(normalizedValue.replace("%", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function comparable(value: string): { kind: "number" | "date" | "text"; value: number | string } {
  const number = numericValue(value);
  if (number !== null) return { kind: "number", value: number };

  const date = Date.parse(value);
  if (Number.isFinite(date) && /\d[/:.-]\d/.test(value)) {
    return { kind: "date", value: date };
  }

  return { kind: "text", value: normalized(value) };
}

function compareRows(left: HTMLTableRowElement, right: HTMLTableRowElement, index: number, direction: 1 | -1) {
  const leftValue = comparable(left.cells[index]?.textContent ?? "");
  const rightValue = comparable(right.cells[index]?.textContent ?? "");
  if (leftValue.kind === rightValue.kind && leftValue.value === rightValue.value) return 0;
  if (leftValue.kind === rightValue.kind && typeof leftValue.value === "number" && typeof rightValue.value === "number") {
    return (leftValue.value - rightValue.value) * direction;
  }
  return String(leftValue.value).localeCompare(String(rightValue.value), "id", {
    numeric: true,
    sensitivity: "base",
  }) * direction;
}

function initializeTable(table: HTMLTableElement) {
  if (table.dataset.sortReady === "true" || table.dataset.sortMode === "server") return;
  const headerRow = table.tHead?.rows[0];
  const bodyRows = Array.from(table.tBodies[0]?.rows ?? []);
  if (!headerRow || bodyRows.length < 2) return;

  table.dataset.sortReady = "true";
  Array.from(headerRow.cells).forEach((cell, index) => {
    const header = cell as HTMLTableCellElement;
    const label = normalized(header.textContent ?? "");
    if (!label || NON_SORTABLE_HEADERS.has(label)) return;

    const button = document.createElement("button");
    button.className = "admin-sort-button";
    button.type = "button";
    button.setAttribute("aria-label", `Urutkan berdasarkan ${header.textContent?.trim() ?? "kolom"}`);
    button.innerHTML = `<span>${header.textContent?.trim() ?? "Kolom"}</span><span class="admin-sort-icon" aria-hidden="true">v^</span>`;
    header.textContent = "";
    header.append(button);

    let direction: 1 | -1 = 1;
    button.addEventListener("click", () => {
      direction = direction === 1 ? -1 : 1;
      Array.from(headerRow.cells).forEach((otherCell) => {
        otherCell.removeAttribute("aria-sort");
        otherCell.querySelector(".admin-sort-icon")?.replaceChildren(document.createTextNode("v^"));
      });
      header.setAttribute("aria-sort", direction === 1 ? "ascending" : "descending");
      button.querySelector(".admin-sort-icon")?.replaceChildren(document.createTextNode(direction === 1 ? "^" : "v"));
      const rows = Array.from(table.tBodies[0]?.rows ?? []);
      rows.sort((left, right) => compareRows(left, right, index, direction));
      const body = table.tBodies[0];
      rows.forEach((row) => body?.append(row));
    });
  });
}

export function AdminTableSorter() {
  useEffect(() => {
    const root = document.querySelector(".admin-content");
    if (!root) return;

    const initialize = () => {
      root.querySelectorAll<HTMLTableElement>("table").forEach(initializeTable);
    };
    initialize();

    const observer = new MutationObserver(initialize);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
