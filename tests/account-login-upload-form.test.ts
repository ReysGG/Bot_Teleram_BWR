import { describe, expect, it } from "vitest";
import { accountLoginFileSelectionError } from "@/components/admin/account-login-upload-form";

describe("account login upload selection", () => {
  it("requires at least one TXT file", () => {
    expect(accountLoginFileSelectionError([])).toBe("Pilih minimal satu file TXT.");
    expect(accountLoginFileSelectionError([{ name: "outlook.txt", size: 128 }])).toBeNull();
    expect(accountLoginFileSelectionError([{ name: "OUTLOOK.TXT", size: 128 }])).toBeNull();
  });

  it("rejects non-TXT and oversized dropped files before submission", () => {
    expect(accountLoginFileSelectionError([{ name: "outlook.json", size: 128 }]))
      .toBe("outlook.json bukan file TXT.");
    expect(accountLoginFileSelectionError([{
      name: "outlook.txt",
      size: 5 * 1024 * 1024 + 1,
    }])).toBe("outlook.txt melebihi batas 5 MB.");
  });

  it("does not impose a client-side file-count limit", () => {
    const files = Array.from({ length: 250 }, (_, index) => ({
      name: `outlook-${index}.txt`,
      size: 32,
    }));
    expect(accountLoginFileSelectionError(files)).toBeNull();
  });
});
