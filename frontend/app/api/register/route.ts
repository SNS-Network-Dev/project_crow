import { NextResponse } from "next/server";
import { embedEnroll, matrixAdd, BMEnrollError } from "@/lib/baremetal";
import {
  findPersonByNameAndCompanyEmail,
  setConsentAt,
  setEmbeddingAndPhoto,
} from "@/lib/db";
import { savePhoto } from "@/lib/photos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRUTHY = new Set(["true", "1", "on", "yes"]);

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
  const companyEmail = (form.get("companyEmail") ?? "").toString().trim();
  const consent = TRUTHY.has(
    (form.get("consent") ?? "").toString().toLowerCase(),
  );

  if (!(photo instanceof Blob) || photo.size === 0) {
    return NextResponse.json(
      { error: "A photo is required." },
      { status: 400 },
    );
  }
  if (!name || !companyEmail) {
    return NextResponse.json(
      { error: "Full name and company email are required." },
      { status: 400 },
    );
  }
  if (!consent) {
    return NextResponse.json(
      { error: "You must consent to face-data use for check-in." },
      { status: 400 },
    );
  }

  const person = await findPersonByNameAndCompanyEmail(name, companyEmail);
  if (!person) {
    return NextResponse.json(
      { error: "No registration found. Please check your details." },
      { status: 404 },
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

  // 2) Save the photo, persist embedding + photo_path, and record consent.
  const photoBytes = Buffer.from(await photo.arrayBuffer());
  const filename = await savePhoto(person.id, photoBytes);
  await setEmbeddingAndPhoto(person.id, embedding, filename);
  await setConsentAt(person.id);

  // 3) Push to the baremetal matrix. Best-effort: if it fails, ensureMatrixSynced
  //    reconciles on the next check-in (DB count will exceed matrix_count).
  try {
    await matrixAdd(person.id, embedding);
  } catch {
    /* self-heals via sync */
  }

  return NextResponse.json({ id: person.id, name: person.name });
}
