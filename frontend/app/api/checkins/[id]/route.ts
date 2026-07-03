import { NextResponse } from "next/server";
import { deleteCheckin } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const checkinId = Number(id);
  if (!Number.isInteger(checkinId) || checkinId <= 0) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  const ok = await deleteCheckin(checkinId);
  if (!ok) {
    return NextResponse.json({ error: "Check-in not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
