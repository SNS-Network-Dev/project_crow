import { NextResponse } from "next/server";
import { deleteAdmin } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid admin id." }, { status: 400 });
  }

  try {
    const ok = await deleteAdmin(id);
    if (!ok) {
      return NextResponse.json({ error: "Admin not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not delete admin." }, { status: 500 });
  }
}
