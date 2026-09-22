import { mkdir, readFile, writeFile, readdir, rename } from 'node:fs/promises';
import path from 'node:path';
const app = path.resolve('storefront/src/app');
const shop = path.join(app, '(shop)');
await mkdir(shop, { recursive: true });
const layout = await readFile(path.join(app, 'layout.tsx'), 'utf8');
if (!layout.includes('ClerkProvider')) throw new Error('Expected original storefront layout');
await writeFile(path.join(shop, 'layout.tsx'), layout.replace('import "./globals.css";', 'import "../globals.css";').replace('<html data-scroll-behavior="smooth" lang="id">', '<>').replace('<body>', '<div className="shop-surface">').replace('</body>', '</div>').replace('</html>', '</>'));
for (const entry of await readdir(app, { withFileTypes: true })) {
  if (entry.isDirectory() && !['admin','api','(shop)'].includes(entry.name)) {
    const target=path.join(shop,entry.name);
    if (!target.startsWith(app+path.sep)) throw new Error('Outside app');
    await rename(path.join(app,entry.name),target);
  }
}
for (const name of ['page.tsx','loading.tsx','error.tsx','not-found.tsx']) {
  try { await rename(path.join(app,name),path.join(shop,name)); } catch(e) { if(e.code!=='ENOENT')throw e; }
}
await writeFile(path.join(app,'layout.tsx'),'import type { ReactNode } from "react";\nexport default function RootLayout({ children }: { children: ReactNode }) {\n return <html lang="id"><body style={{margin:0}}>{children}</body></html>;\n}\n');
const original=await readFile('src/app/globals.css','utf8');
const scoped=original.replaceAll(':root',':scope').replace(/^html\s*\{/m,':scope {').replace(/^body\s*\{/m,':scope {');
await writeFile(path.join(app,'admin','admin.css'),'/* Scoped legacy admin styles; storefront styles stay separate. */\n@scope (.admin-surface) {\n'+scoped+'\n}\n');
await writeFile(path.join(app,'admin','layout.tsx'),'import type { ReactNode } from "react";\nimport "./admin.css";\nexport default function AdminLayout({children}:{children:ReactNode}) { return <div className="admin-surface">{children}</div>; }\n');
console.log('Admin and shop layouts separated without URL changes');
