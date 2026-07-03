import { NextResponse } from "next/server";
import { findPersonByNameAndCompanyEmail } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad JSON." }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  const companyEmail = (body.companyEmail ?? "").trim().toLowerCase();

  if (!name || !companyEmail) {
    return NextResponse.json(
      { error: "Full name and company email are required." },
      { status: 400 },
    );
  }

  const person = await findPersonByNameAndCompanyEmail(name, companyEmail);
  if (!person) {
    return NextResponse.json(
      {
        error:
          "No registration found. Please check your name and company email.",
      },
      { status: 404 },
    );
  }

  return NextResponse.json({
    id: person.id,
    name: person.name,
    contactNumber: person.contact_number,
    companyEmail: person.company_email,
    fullCompanyName: person.full_company_name,
    designation: person.designation,
    invitedBy: person.invited_by,
    remarks: person.remarks,
  });
}
