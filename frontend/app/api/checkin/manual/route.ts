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
  // 'self' when the guest checks themselves in on /checkin; 'manual' when
  // an operator checks them in from the admin list (the default).
  const method: CheckinMethod = body?.method === "self" ? "self" : "manual";

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

  // Score 0 marks a non-face check-in (manual by operator, or guest self-serve).
  await logCheckin(personId, 0, method);
  return NextResponse.json({
    ok: true,
    name: person.name,
    full_company_name: person.full_company_name,
    checked_in_at: new Date().toISOString(),
  });
}
