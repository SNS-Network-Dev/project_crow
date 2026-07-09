import { NextResponse } from "next/server";
import { listSets, removePoster } from "@/lib/gallery";
import { deletePoster } from "@/lib/posters";
import { BASE_PATH } from "@/lib/basePath";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The live wall feed for the pickup station (operator-gated via proxy.ts — this
// sits under the protected /api/avatar prefix; the gallery page at
// /admin/avatar/gallery polls this.
// Poster thumbnails are served through the gated /api/posters/[id] (the operator
// device has the cookie); the phone download link uses the PUBLIC /api/shot/[id].
export async function GET() {
  const sets = await listSets();
  return NextResponse.json({
    sets: sets.map((s) => ({
      id: s.id,
      createdAt: s.createdAt,
      mode: s.mode,
      posters: s.posters.map((p) => ({
        id: p.id,
        url: `${BASE_PATH}/api/posters/${p.id}`,
        variant: p.variant,
        seed: p.seed,
      })),
    })),
  });
}

// Delete one poster from the wall: DELETE with JSON body { posterId }. Removes
// the gallery entry and unlinks the PNG. Operator-gated (/api/avatar prefix).
const ID_RE = /^[a-zA-Z0-9._-]{8,64}$/;

export async function DELETE(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { posterId?: unknown }
    | null;
  const posterId = typeof body?.posterId === "string" ? body.posterId : "";
  if (!ID_RE.test(posterId)) {
    return NextResponse.json({ error: "Invalid posterId." }, { status: 400 });
  }

  const removed = await removePoster(posterId);
  await deletePoster(posterId); // best-effort file unlink
  return NextResponse.json({ ok: true, removed });
}
