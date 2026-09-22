import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest, type NextFetchEvent } from "next/server";

const customerMiddleware = clerkMiddleware((_auth, request) => {
  if (process.env.STOREFRONT_PREVIEW_READ_ONLY === "true" &&
      request.nextUrl.pathname.startsWith("/api/") &&
      !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    return NextResponse.json({ ok: false, code: "preview_read_only" }, {
      status: 503, headers: { "cache-control": "private, no-store" },
    });
  }
});

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  const pathname = request.nextUrl.pathname;
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return NextResponse.next();
  // Admin retains its signed server-side session and per-action origin checks.
  // It must not depend on a customer Clerk key or customer preview flag.
  if (pathname === "/admin" || pathname.startsWith("/admin/") || pathname.startsWith("/api/admin/") || pathname === "/api/health" || ((pathname === "/seller" || pathname.startsWith("/seller/")) && process.env.SELLER_PORTAL_ENABLED !== "true")) {
    return NextResponse.next();
  }
  return customerMiddleware(request, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
