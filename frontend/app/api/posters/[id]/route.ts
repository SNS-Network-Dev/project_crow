import { readPoster } from "@/lib/posters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Serve a generated avatar poster PNG. Posters live on the bridge filesystem
// (POSTERS_DIR), not in public/, so access goes through here — mirrors photos/[id].
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const buf = await readPoster(id);
  if (!buf) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
