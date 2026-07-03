import { NextResponse } from "next/server";
import { listSets } from "@/lib/gallery";
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
