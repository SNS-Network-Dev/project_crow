import { NextResponse } from "next/server";
import { getPersonByQrCode, latestCheckinForPerson, logCheckin } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// QR check-in: a USB scanner reads a guest's invitation QR (which encodes the
// per-person code stored in qr_code_path) and this records the check-in. Mirrors
// /api/checkin/manual, but keyed by QR code instead of person_id. Gated by
// proxy (pathname.startsWith("/api/checkin")).
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code.trim() : "";

  if (!code) {
    return NextResponse.json({ error: "QR code is required." }, { status: 400 });
  }

  const person = await getPersonByQrCode(code);
  if (!person) {
    return NextResponse.json(
      { error: "QR code not recognized." },
      { status: 404 },
    );
  }

  const existing = await latestCheckinForPerson(person.id);
  if (existing) {
    return NextResponse.json({
      ok: false,
      alreadyCheckedIn: true,
      name: person.name,
      full_company_name: person.full_company_name,
      checked_in_at: existing.checked_in_at,
    });
  }

  // Score 0 marks a non-face check-in (same convention as manual check-in).
  await logCheckin(person.id, 0, "qr");
  return NextResponse.json({
    ok: true,
    name: person.name,
    full_company_name: person.full_company_name,
    checked_in_at: new Date().toISOString(),
  });
}
