import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import {
  isLocalAuthBypassEnabled,
  logLocalAuthBypassWarningOnce,
} from "@/lib/local-auth-bypass";
import { MAX_PDF_SIZE } from "@/lib/upload-security";
import { createReviewPayloadTooLargeResponse } from "@/lib/review-middleware-errors";

/** Extra bytes for multipart boundaries and field metadata. */
const REVIEW_UPLOAD_OVERHEAD_BYTES = 1024 * 1024;

const PUBLIC_API_ROUTES = new Set([
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/session",
]);

function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    /\.(png|jpg|jpeg|gif|webp|svg|ico)$/i.test(pathname)
  );
}

function isReviewUploadTooLarge(request: NextRequest): boolean {
  if (request.method !== "POST" || request.nextUrl.pathname !== "/api/review") {
    return false;
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return false;
  }

  const contentLength = request.headers.get("content-length");
  if (!contentLength) return false;

  const size = Number.parseInt(contentLength, 10);
  if (!Number.isFinite(size)) return false;

  return size > MAX_PDF_SIZE + REVIEW_UPLOAD_OVERHEAD_BYTES;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  if (isReviewUploadTooLarge(request)) {
    return createReviewPayloadTooLargeResponse();
  }

  if (isLocalAuthBypassEnabled()) {
    logLocalAuthBypassWarningOnce();
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;
  const isAuthenticated = token ? await verifySessionToken(token) : false;

  if (PUBLIC_API_ROUTES.has(pathname)) {
    if (pathname === "/api/auth/login" && isAuthenticated) {
      return NextResponse.json({ error: "Already signed in." }, { status: 400 });
    }
    return NextResponse.next();
  }

  if (pathname === "/login") {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (!isAuthenticated) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("from", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/api/:path*",
  ],
};
