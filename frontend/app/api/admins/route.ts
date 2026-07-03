import { NextResponse } from "next/server";
import { createAdmin, listAdmins } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const admins = await listAdmins();
    return NextResponse.json({
      admins: admins.map((a) => ({ id: a.id, email: a.email, created_at: a.created_at })),
    });
  } catch {
    return NextResponse.json({ error: "Could not load admins." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: Record<string, string>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad JSON." }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";

  if (!email || !password || password.length < 6) {
    return NextResponse.json(
      { error: "Email and a password of at least 6 characters are required." },
      { status: 400 },
    );
  }

  try {
    const id = await createAdmin({ email, password });
    return NextResponse.json({ id, email });
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    if (message.includes("Duplicate") || message.includes("duplicate")) {
      return NextResponse.json({ error: "An admin with that email already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: "Could not create admin." }, { status: 500 });
  }
}
