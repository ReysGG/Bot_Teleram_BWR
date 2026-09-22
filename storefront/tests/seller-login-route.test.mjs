import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("seller login has a dedicated themed route and local preview entry", async () => {
  const page = await read("src/app/seller/login/page.tsx");
  const css = await read("src/app/seller/seller.css");
  assert.match(page, /Buka preview seller/);
  assert.match(page, /Masuk dengan akun seller/);
  assert.match(page, /isLocalPreview/);
  assert.match(css, /seller-login-grid/);
  assert.match(css, /seller-login-art/);
});
