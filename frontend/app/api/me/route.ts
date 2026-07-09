import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, verifyAdminToken } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "Who am I" — returns the signed-in admin's email (from the verified session
// JWT) so the sidebar can show it. Returns null when not signed in. Only ever
// reveals the caller's own email, so it's safe to leave ungated.
export async function GET() {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  const payload = verifyAdminToken(token);
  return NextResponse.json({ email: payload?.sub ?? null });
}
