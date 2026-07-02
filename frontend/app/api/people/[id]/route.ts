import { NextResponse } from "next/server";
import { deletePerson, updatePerson } from "@/lib/db";
import { deletePhoto } from "@/lib/photos";
import { matrixRemove } from "@/lib/baremetal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Edit path: update a subset of the editable fields. `null` clears a field;
// absent keys are left untouched (updatePerson skips undefined). Embeddings and
// consent_at are not editable here.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const personId = Number(id);
  if (!Number.isInteger(personId) || personId <= 0) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad JSON." }, { status: 400 });
  }

  // Accept only known editable fields. A string sets; null clears; absent = skip.
  const fieldMap: Record<string, string> = {
    name: "name",
    email: "email",
    contactNumber: "contactNumber",
    companyEmail: "companyEmail",
    fullCompanyName: "fullCompanyName",
    designation: "designation",
    invitedBy: "invitedBy",
    remarks: "remarks",
  };
  const patch: Record<string, string | null> = {};
  for (const [bodyKey, fnKey] of Object.entries(fieldMap)) {
    if (!(bodyKey in body)) continue;
    const v = body[bodyKey];
    if (v === null) patch[fnKey] = null;
    else if (typeof v === "string") patch[fnKey] = v;
    // non-string, non-null values for a known key are ignored
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  const ok = await updatePerson(personId, patch as Parameters<typeof updatePerson>[1]);
  if (!ok) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

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
