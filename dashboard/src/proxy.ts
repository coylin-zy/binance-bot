import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = new Set(["/login", "/api/auth/login"]);

function securityHeaders() {
  const scriptPolicy = process.env.NODE_ENV === "development"
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'";
  const connectPolicy = process.env.NODE_ENV === "development"
    ? "connect-src 'self' ws: wss:"
    : "connect-src 'self'";

  return [
    "default-src 'self'",
    scriptPolicy,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    connectPolicy,
    "font-src 'self' data:",
    "object-src 'none'",
    "frame-src 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = req.cookies.has("ft_access") || req.cookies.has("ft_refresh");
  const isPublic = PUBLIC_PATHS.has(pathname);

  let response: NextResponse;
  if (!isPublic && !hasSession && !pathname.startsWith("/api/")) {
    response = NextResponse.redirect(new URL("/login", req.url));
  } else if (pathname === "/login" && hasSession) {
    response = NextResponse.redirect(new URL("/", req.url));
  } else {
    response = NextResponse.next();
  }

  response.headers.set("Content-Security-Policy", securityHeaders());
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Permitted-Cross-Domain-Policies", "none");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
