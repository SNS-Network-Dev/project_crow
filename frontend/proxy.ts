import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Next 16 renamed `middleware.ts` -> `proxy.ts` (Node runtime; the function is
// `proxy`, not `middleware`). See node_modules/next/dist/docs/.../proxy.md.
//
// Access control for Project Crow:
//   /register and /               -> public (guests use these)
//   /checkin /avatar /kiosk /admin -> operator-only (and their /api/* routes)
//
// Auth model: a single shared passphrase in the ADMIN_PASSWORD env var. The
// /api/login route verifies that passphrase and sets an httpOnly `crow_admin`
// cookie whose value IS the password (compared here). A second client-readable
// `crow_admin_status=1` cookie lets the Sidebar show/hide admin links without
// exposing the secret.
//
// When ADMIN_PASSWORD is unset, admin is open (localhost dev convenience) and
// we stamp `crow_admin_status=1` so the Sidebar still reveals the admin links.

const ADMIN_COOKIE = "crow_admin";

function isProtectedPage(pathname: string): boolean {
  return (
    pathname === "/checkin" ||
    pathname.startsWith("/checkin/") ||
    pathname === "/avatar" ||
    pathname.startsWith("/avatar/") ||
    pathname === "/kiosk" ||
    pathname.startsWith("/kiosk/") ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/")
  );
}

function isProtectedApi(pathname: string): boolean {
  // NOTE: '/api/checkin' prefix also covers '/api/checkins'. '/api/people'
  // covers '/api/people/[id]'. Public APIs (/api/register, /api/health,
  // /api/login, /api/logout) are intentionally not listed here.
  return (
    pathname.startsWith("/api/people") ||
    pathname.startsWith("/api/checkin") ||
    pathname.startsWith("/api/stats") ||
    pathname.startsWith("/api/confirm") ||
    pathname.startsWith("/api/avatar") ||
    pathname.startsWith("/api/photos") ||
    pathname.startsWith("/api/posters")
  );
}

export function proxy(request: NextRequest) {
  const pw = process.env.ADMIN_PASSWORD;
  const pathname = request.nextUrl.pathname;

  // No passphrase configured -> admin stays open (dev). Still set the status
  // cookie so the Sidebar shows the admin nav without a login.
  if (!pw) {
    const res = NextResponse.next();
    if (request.cookies.get("crow_admin_status")?.value !== "1") {
      res.cookies.set("crow_admin_status", "1", {
        httpOnly: false,
        sameSite: "lax",
        path: "/",
      });
    }
    return res;
  }

  const protectedPage = isProtectedPage(pathname);
  const protectedApi = isProtectedApi(pathname);
  if (!protectedPage && !protectedApi) {
    return NextResponse.next();
  }

  // Authed? Compare the httpOnly token to the configured passphrase.
  const token = request.cookies.get(ADMIN_COOKIE)?.value;
  if (token && token === pw) {
    return NextResponse.next();
  }

  // Blocked. APIs get a 401 JSON; pages redirect to /login with a `next` param
  // (pathname is basePath-stripped, so the return-to path is router-ready).
  if (protectedApi) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const basePath = request.nextUrl.basePath;
  const loginUrl = new URL(`${basePath}/login`, request.url);
  loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Run on everything except static assets and the self-hosted MediaPipe wasm
  // under /mediapipe. (Next still runs proxy for _next/data routes even when
  // they're excluded — that's desired so protected page data is gated too.)
  matcher: ["/((?!_next/static|_next/image|favicon.ico|mediapipe).*)"],
};