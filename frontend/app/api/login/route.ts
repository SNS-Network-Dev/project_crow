import { NextResponse } from "next/server";
import { countAdmins, findAdminByEmail, verifyPassword } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_COOKIE = "crow_admin";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { email?: unknown; password?: unknown }
    | null;
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  let dbAuthenticated = false;

  // Prefer database admins. If at least one admin exists, enforce DB auth.
  try {
    const adminCount = await countAdmins();
    if (adminCount > 0) {
      if (!email) {
        return NextResponse.json(
          { error: "Email and password are required." },
          { status: 400 },
        );
      }
      const admin = await findAdminByEmail(email);
      if (!admin || !verifyPassword(password, admin.password_hash)) {
        return NextResponse.json(
          { error: "Wrong email or password." },
          { status: 401 },
        );
      }
      dbAuthenticated = true;
    }
  } catch {
    return NextResponse.json(
      { error: "Could not verify credentials. Try again." },
      { status: 503 },
    );
  }

  // Fallback to env ADMIN_PASSWORD when no DB admins exist (dev / bootstrap).
  const envPw = process.env.ADMIN_PASSWORD;
  if (!dbAuthenticated) {
    if (!envPw) {
      return NextResponse.json(
        { error: "No admin password is configured. Admin is open — just visit /admin." },
        { status: 503 },
      );
    }
    if (password !== envPw) {
      return NextResponse.json({ error: "Wrong password." }, { status: 401 });
    }
  }

  const token = dbAuthenticated
    ? `${ADMIN_COOKIE}:db:${email}:${new Date().toISOString()}`
    : (envPw ?? "");

  const res = NextResponse.json({ ok: true });
  // httpOnly token the proxy checks. For DB auth we still need a stable secret
  // comparable in proxy.ts, so we keep envPw as the cookie value when present.
  res.cookies.set(ADMIN_COOKIE, envPw ?? token, {
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