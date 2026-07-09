import { NextResponse } from "next/server";
import {
  getPerson,
  latestCheckinForPerson,
  logCheckin,
  type CheckinMethod,
} from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const personId = Number(body?.person_id);
  const scoreRaw = Number(body?.score ?? 0);
  const score = Number.isFinite(scoreRaw) ? scoreRaw : 0;
  // Which surface did the check-in: 'self' (guest on /checkin) vs 'face'
  // (operator/kiosk recognition, the default). Both use face matching.
  const method: CheckinMethod = body?.method === "self" ? "self" : "face";

  if (!Number.isInteger(personId) || personId <= 0) {
    return NextResponse.json(
      { error: "person_id is required." },
      { status: 400 },
    );
  }

  const person = await getPerson(personId);
  if (!person) {
    return NextResponse.json({ error: "Unknown person." }, { status: 404 });
  }

  // One check-in per person. If they've already checked in, don't insert a
  // duplicate — report it back so the kiosk can notify the operator. The
  // existing check-in's timestamp is returned for the notice.
  const existing = await latestCheckinForPerson(personId);
  if (existing) {
    return NextResponse.json({
      ok: false,
      alreadyCheckedIn: true,
      name: person.name,
      full_company_name: person.full_company_name,
      checked_in_at: existing.checked_in_at,
    });
  }

  await logCheckin(personId, score, method);
  return NextResponse.json({
    ok: true,
    name: person.name,
    full_company_name: person.full_company_name,
    checked_in_at: new Date().toISOString(),
  });
}
