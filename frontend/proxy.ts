import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionSecret, verifyAdminToken } from "./lib/session";

// Next 16 renamed `middleware.ts` -> `proxy.ts` (Node runtime; the function is
// `proxy`, not `middleware`). See node_modules/next/dist/docs/.../proxy.md.
//
// Access control for Project Crow:
//   /register and /                -> public (guests use these)
//   /admin/* and /kiosk              -> operator-only (and their /api/* routes)
//
// Auth model: admin credentials live in the database (project_crow_admins).
// /api/login verifies email/password and sets a signed httpOnly JWT cookie.
// The signature key is SESSION_SECRET in frontend/.env.local — it is NOT an
// admin password, just a random signing secret needed because middleware
// cannot query MySQL. A second client-readable `crow_admin_status=1` cookie
// lets the Sidebar show/hide admin links without exposing the token.

const ADMIN_COOKIE = "crow_admin";
const STATUS_COOKIE = "crow_admin_status";

function isProtectedPage(pathname: string): boolean {
  return (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/kiosk" ||
    pathname.startsWith("/kiosk/")
  );
}

function isProtectedApi(request: NextRequest): boolean {
  const pathname = request.nextUrl.pathname;
  const method = request.method;

  // NOTE: '/api/checkin' prefix also covers '/api/checkins'. '/api/people'
  // covers '/api/people/[id]'. Public APIs (/api/register, /api/health,
  // /api/login, /api/logout) are intentionally not listed here.
  //
  // /api/settings GET is public (used by /early-checkin), but mutations are
  // admin-only. /api/admins is fully admin-only.
  if (pathname.startsWith("/api/admins")) return true;
  if (
    (pathname === "/api/settings" || pathname.startsWith("/api/settings/")) &&
    method !== "GET" &&
    method !== "HEAD"
  ) {
    return true;
  }

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

function isAuthed(request: NextRequest): boolean {
  try {
    const secret = getSessionSecret();
    const token = request.cookies.get(ADMIN_COOKIE)?.value;
    return verifyAdminToken(token, secret) !== null;
  } catch {
    return false;
  }
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Keep the client-readable status cookie fresh whenever an admin page is hit.
  // If the admin cookie is present but we can't verify it, clear both so the
  // client knows to re-authenticate.
  const protectedPage = isProtectedPage(pathname);
  const protectedApi = isProtectedApi(request);

  if (!protectedPage && !protectedApi) {
    return NextResponse.next();
  }

  const authed = isAuthed(request);

  if (authed) {
    const res = NextResponse.next();
    if (request.cookies.get(STATUS_COOKIE)?.value !== "1") {
      res.cookies.set(STATUS_COOKIE, "1", {
        httpOnly: false,
        sameSite: "lax",
        path: "/",
      });
    }
    return res;
  }

  // Blocked. APIs get a 401 JSON; pages redirect to /login with a `next` param
  // (pathname is basePath-stripped, so the return-to path is router-ready).
  if (protectedApi) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const basePath = request.nextUrl.basePath;
  const loginUrl = new URL(`${basePath}/login`, request.url);
  loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
  const res = NextResponse.redirect(loginUrl);
  res.cookies.delete(ADMIN_COOKIE);
  res.cookies.delete(STATUS_COOKIE);
  return res;
}

export const config = {
  // Run on everything except static assets and the self-hosted MediaPipe wasm
  // under /mediapipe. (Next still runs proxy for _next/data routes even when
  // they're excluded — that's desired so protected page data is gated too.)
  matcher: ["/((?!_next/static|_next/image|favicon.ico|mediapipe).*)"],
};
