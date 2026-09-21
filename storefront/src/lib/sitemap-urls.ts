type PublicCatalog = { source: string; products: Array<{ slug: string }>; groups: Array<{ slug: string }> };

export function sitemapUrls(catalog: PublicCatalog, origin: string): string[] {
  if (catalog.source !== "api") throw new Error("Live catalog unavailable for sitemap");
  const base = new URL(origin);
  if (base.protocol !== "https:") throw new Error("Public sitemap requires HTTPS");
  const paths = ["/", "/shop", "/categories",
    ...catalog.groups.filter(group => group.slug).map(group => "/categories/" + encodeURIComponent(group.slug)),
    ...catalog.products.filter(product => product.slug).map(product => "/products/" + encodeURIComponent(product.slug)),
  ];
  return [...new Set(paths)].map(path => new URL(path, base.origin).href);
}

export function renderSitemap(urls: string[]): string {
  const escapeXml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + urls.map(url => `  <url><loc>${escapeXml(url)}</loc></url>`).join("\n")
    + "\n</urlset>\n";
}
