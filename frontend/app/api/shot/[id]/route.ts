import { readPoster } from "@/lib/posters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PUBLIC poster download for guests' phones. Deliberately NOT under a proxy.ts
// protected prefix: a guest scans the QR on their own phone (no operator cookie).
// Access is a capability URL — the poster id is a random UUID (unguessable). The
// operator-facing gallery uses the gated /api/posters/[id]; this is the phone path.
// `?dl=1` forces a download (Save), otherwise it displays inline (long-press to save).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const buf = await readPoster(id);
  if (!buf) return new Response("Not found", { status: 404 });

  const dl = new URL(req.url).searchParams.get("dl");
  const headers: Record<string, string> = {
    "Content-Type": "image/png",
    "Cache-Control": "public, max-age=86400",
  };
  if (dl) headers["Content-Disposition"] = `attachment; filename="event-poster-${id.slice(0, 8)}.png"`;

  return new Response(new Uint8Array(buf), { headers });
}
