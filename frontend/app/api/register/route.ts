import { NextResponse } from "next/server";
import { embedEnroll, matrixAdd, BMEnrollError } from "@/lib/baremetal";
import { createPerson, generateUniqueQrCode, setPhotoPath } from "@/lib/db";
import { savePhoto } from "@/lib/photos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRUTHY = new Set(["true", "1", "on", "yes"]);

function trimOrNull(v: string): string | null {
  const t = v.trim();
  return t ? t : null;
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data." },
      { status: 400 },
    );
  }

  const photo = form.get("photo");
  const name = (form.get("name") ?? "").toString().trim();
  const consent = TRUTHY.has(
    (form.get("consent") ?? "").toString().toLowerCase(),
  );

  // New registration fields
  const contactNumber = trimOrNull(
    (form.get("contactNumber") ?? "").toString(),
  );
  const companyEmail = trimOrNull((form.get("companyEmail") ?? "").toString());
  const fullCompanyName = trimOrNull(
    (form.get("fullCompanyName") ?? "").toString(),
  );
  const designation = trimOrNull((form.get("designation") ?? "").toString());
  const invitedBy = trimOrNull((form.get("invitedBy") ?? "").toString());
  const remarks = trimOrNull((form.get("remarks") ?? "").toString());

  // Legacy details field (kept for backward compatibility)
  const detailsRaw = trimOrNull((form.get("details") ?? "").toString());
  let details: string | null = null;
  if (detailsRaw) {
    try {
      details = JSON.stringify(JSON.parse(detailsRaw));
    } catch {
      details = JSON.stringify({ note: detailsRaw });
    }
  }

  if (!(photo instanceof Blob) || photo.size === 0) {
    return NextResponse.json(
      { error: "A photo is required." },
      { status: 400 },
    );
  }
  if (!name) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }
  if (!consent) {
    return NextResponse.json(
      { error: "You must consent to your face data being used for check-in." },
      { status: 400 },
    );
  }

  // 1) Strict embedding from baremetal (QC enforced there).
  let embedding: Buffer;
  try {
    embedding = await embedEnroll(photo);
  } catch (e) {
    if (e instanceof BMEnrollError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Face service unavailable. Try again shortly." },
      { status: 503 },
    );
  }

  // 2) Persist in MySQL (the source of truth), then store the photo as <id>.jpg.
  const photoBytes = Buffer.from(await photo.arrayBuffer());
  const qrCode = await generateUniqueQrCode();
  const id = await createPerson({
    name,
    contactNumber,
    companyEmail,
    fullCompanyName,
    designation,
    invitedBy,
    details,
    remarks,
    qrCode,
    embedding,
    consent,
  });
  const filename = await savePhoto(id, photoBytes);
  await setPhotoPath(id, filename);

  // 3) Push to the baremetal matrix. Best-effort: if it fails, ensureMatrixSynced
  //    reconciles on the next check-in (DB count will exceed matrix_count).
  try {
    await matrixAdd(id, embedding);
  } catch {
    /* self-heals via sync */
  }

  return NextResponse.json({ id, name, qrCode });
}
