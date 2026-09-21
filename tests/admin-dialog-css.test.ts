import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("admin dialog CSS layering", () => {
  it("keeps result dialogs fixed instead of returning them to document flow", () => {
    const css = readFileSync(resolve("src/app/globals.css"), "utf8");
    const dialogRule = css.match(/\.admin-dialog-content\s*\{([^}]*)\}/)?.[1] ?? "";
    const resultRule = css.match(/\.result-modal\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(dialogRule).toMatch(/position:\s*fixed/);
    expect(resultRule).not.toMatch(/position\s*:/);
  });
});
