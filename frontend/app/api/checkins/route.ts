import { NextResponse } from "next/server";
import { recentCheckins, checkinsForPerson } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ?limit=N        -> recent check-ins across everyone (default 50)
// ?personId=ID    -> full history for one person (default 200) — used by the admin drawer
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const personIdRaw = sp.get("personId");

  if (personIdRaw !== null) {
    const personId = Number(personIdRaw);
    if (!Number.isInteger(personId) || personId <= 0) {
      return NextResponse.json({ error: "Invalid personId." }, { status: 400 });
    }
    const limit = Number(sp.get("limit") ?? 200);
    const rows = await checkinsForPerson(personId, limit);
    return NextResponse.json({
      checkins: rows.map((r) => ({
        id: r.id,
        person_id: r.person_id,
        name: r.name,
        score: r.score,
        method: r.method,
        checked_in_at: r.checked_in_at,
      })),
    });
  }

  const limit = Number(sp.get("limit") ?? 50);
  const rows = await recentCheckins(limit);
  return NextResponse.json({
    checkins: rows.map((r) => ({
      id: r.id,
      person_id: r.person_id,
      name: r.name,
      score: r.score,
      method: r.method,
      checked_in_at: r.checked_in_at,
    })),
  });
}
