import { NextResponse } from "next/server";
import { listPeople } from "@/lib/db";
import { BASE_PATH } from "@/lib/basePath";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
