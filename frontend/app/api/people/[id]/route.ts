import { NextResponse } from "next/server";
import { deletePerson } from "@/lib/db";
import { deletePhoto } from "@/lib/photos";
import { matrixRemove } from "@/lib/baremetal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Deletion path (privacy): remove DB row + photo file + baremetal matrix entry.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const personId = Number(id);
  if (!Number.isInteger(personId) || personId <= 0) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  const person = await deletePerson(personId);
  if (!person) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (person.photo_path) await deletePhoto(person.photo_path);
  try {
    await matrixRemove(personId);
  } catch {
    /* matrix self-heals on next sync (count will exceed DB) */
  }

  return NextResponse.json({ ok: true });
}
