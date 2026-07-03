import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_COOKIE = "crow_admin";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export async function POST(request: Request) {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) {
    // No passphrase configured -> admin is open (see proxy.ts). Nothing to log
    // into; tell the client so the login page can explain.
    return NextResponse.json(
      { error: "No admin password is configured. Operator area is open — just visit /list." },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  const password = typeof body?.password === "string" ? body.password : "";

  if (password !== pw) {
    return NextResponse.json({ error: "Wrong password." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  // httpOnly token the proxy checks; value is the passphrase itself (compared
  // to ADMIN_PASSWORD). Good enough for a LAN event tool; the cookie is not
  // JS-readable. The separate status cookie below is what the Sidebar reads.
  res.cookies.set(ADMIN_COOKIE, pw, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
  res.cookies.set("crow_admin_status", "1", {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
  return res;
}