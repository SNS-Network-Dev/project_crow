import { NextResponse } from "next/server";
import {
  countAdmins,
  createAdmin,
  findAdminByEmail,
  verifyPassword,
} from "@/lib/db";
import { adminCookies } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_BOOTSTRAP_EMAIL = "admin@projectcrow.com";
const DEFAULT_BOOTSTRAP_PASSWORD = "123";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { email?: unknown; password?: unknown }
    | null;
  let email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  try {
    let adminCount = await countAdmins();

    // First-boot bootstrap: create a default admin so the user can log in.
    // This only happens while the admins table is empty.
    if (adminCount === 0) {
      await createAdmin({
        email: DEFAULT_BOOTSTRAP_EMAIL,
        password: DEFAULT_BOOTSTRAP_PASSWORD,
      });
      adminCount = 1;
    }

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

    const cookies = adminCookies(admin.email);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(cookies.token);
    res.cookies.set(cookies.status);
    return res;
  } catch {
    return NextResponse.json(
      { error: "Could not sign in. Try again." },
      { status: 503 },
    );
  }
}
