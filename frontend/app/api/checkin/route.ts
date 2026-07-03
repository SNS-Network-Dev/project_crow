import { NextResponse } from "next/server";
import { checkin, ensureMatrixSynced } from "@/lib/baremetal";
import { getPerson } from "@/lib/db";
import { BASE_PATH } from "@/lib/basePath";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data." }, { status: 400 });
  }

  const frame = form.get("frame");
  if (!(frame instanceof Blob) || frame.size === 0) {
    // No frame -> behave like "no face": client shows retry / manual entry.
    return NextResponse.json({ candidates: [] });
  }

  // Make sure baremetal's matrix matches the DB before matching (cheap; throttled).
  try {
    await ensureMatrixSynced();
  } catch {
    /* non-fatal — checkin below will surface a hard failure if baremetal is down */
  }

  let raw;
  try {
    raw = await checkin(frame);
  } catch {
    return NextResponse.json({ error: "Face service unavailable. Try again shortly." }, { status: 503 });
  }

  // Enrich baremetal's (person_id, score) with name, company + thumbnail from MySQL.
  const candidates: {
    person_id: number;
    name: string;
    full_company_name: string | null;
    photo_url: string | null;
    score: number;
    confident: boolean;
  }[] = [];
  for (const c of raw) {
    const person = await getPerson(c.person_id);
    if (!person) continue; // transient DB/matrix drift — skip
    candidates.push({
      person_id: c.person_id,
      name: person.name,
      full_company_name: person.full_company_name,
      photo_url: person.photo_path ? `${BASE_PATH}/api/photos/${c.person_id}` : null,
      score: c.score,
      confident: c.confident,
    });
  }

  return NextResponse.json({ candidates });
}
