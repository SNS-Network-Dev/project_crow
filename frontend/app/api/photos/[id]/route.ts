import { getPerson } from "@/lib/db";
import { readPhoto } from "@/lib/photos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Serve a registration photo as a confirm-screen thumbnail. Photos live on the
// bridge filesystem (PHOTO_DIR), not in public/, so access goes through here.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const personId = Number(id);
  if (!Number.isInteger(personId)) return new Response("Not found", { status: 404 });

  const person = await getPerson(personId);
  if (!person?.photo_path) return new Response("Not found", { status: 404 });

  const buf = await readPhoto(person.photo_path);
  if (!buf) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, max-age=60",
    },
  });
}
