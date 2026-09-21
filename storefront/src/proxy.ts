import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export default clerkMiddleware((_auth, request) => {
  if (process.env.STOREFRONT_PREVIEW_READ_ONLY === "true" &&
      request.nextUrl.pathname.startsWith("/api/") &&
      !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    return NextResponse.json({ ok: false, code: "preview_read_only" }, {
      status: 503, headers: { "cache-control": "private, no-store" },
    });
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
