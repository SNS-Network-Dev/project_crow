import { NextResponse } from "next/server";
import {
  createPerson,
  dedupKey,
  existingDedupKeys,
  generateUniqueQrCode,
  listPeople,
} from "@/lib/db";
import { BASE_PATH } from "@/lib/basePath";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRUTHY = new Set(["true", "1", "on", "yes"]);

function str(v: unknown): string | null {
  const s = (v ?? "").toString().trim();
  return s === "" ? null : s;
}

// Add a single guest manually (the "Add guest" button on /list). Like the Excel
// import: no photo/embedding (they enrol a face later via /register), a fresh
// unique QR code, and duplicate protection on name + company email.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;

  const name = str(body?.name);
  if (!name) {
    return NextResponse.json(
      { error: "Full name is required." },
      { status: 400 },
    );
  }
  const companyEmail = str(body?.companyEmail);

  const existing = await existingDedupKeys();
  if (existing.has(dedupKey(name, companyEmail))) {
    return NextResponse.json(
      { error: "A guest with this name and company email already exists." },
      { status: 409 },
    );
  }

  const qrCode = await generateUniqueQrCode();
  const id = await createPerson({
    name,
    contactNumber: str(body?.contactNumber),
    companyEmail,
    fullCompanyName: str(body?.fullCompanyName),
    designation: str(body?.designation),
    invitedBy: str(body?.invitedBy),
    remarks: str(body?.remarks),
    qrCode,
    consent: TRUTHY.has((body?.consent ?? "").toString().toLowerCase()),
    // no embedding -> stored empty; guest enrols a face later via /register
  });

  return NextResponse.json({ ok: true, id, qr_code: qrCode });
}

// Used by the "None of these / manual entry" fallback and the admin page.
export async function GET() {
  const rows = await listPeople();
  return NextResponse.json({
    people: rows.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      contact_number: p.contact_number,
      company_email: p.company_email,
      full_company_name: p.full_company_name,
      designation: p.designation,
      invited_by: p.invited_by,
      remarks: p.remarks,
      photo_url: p.photo_path ? `${BASE_PATH}/api/photos/${p.id}` : null,
      qr_code_path: p.qr_code_path,
      consent_at: p.consent_at,
      created_at: p.created_at,
      updated_at: p.updated_at,
    })),
  });
}
