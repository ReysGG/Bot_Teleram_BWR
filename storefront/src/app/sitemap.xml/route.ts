import { loadCatalogSnapshot } from "@/lib/catalog-model";
import { renderSitemap, sitemapUrls } from "@/lib/sitemap-urls";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const catalog = await loadCatalogSnapshot();
    const urls = sitemapUrls(catalog, process.env.APP_URL ?? "https://store.buildwithreys.com");
    return new Response(renderSitemap(urls), {
      headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch {
    // Avoid publishing an empty sitemap when the catalog provider is down.
    return new Response("Sitemap temporarily unavailable", {
      status: 503, headers: { "cache-control": "no-store", "retry-after": "60" },
    });
  }
}
