import { NextResponse } from "next/server";
import {
  createPerson,
  dedupKey,
  existingPeopleForImport,
  generateUniqueQrCode,
  setConsentAt,
  updatePerson,
  type ImportMatchPerson,
} from "@/lib/db";
import {
  ExcelParseError,
  parseGuestWorkbook,
  type ImportedGuest,
} from "@/lib/excelImport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB — the registration sheet is ~25 KB.

interface FieldDiff {
  field: string; // guest key, e.g. "contactNumber"
  label: string; // human label
  before: string | null;
  after: string | null;
}

interface UpdateEntry {
  guest: ImportedGuest;
  id: number;
  diffs: FieldDiff[];
}

interface DuplicateRow {
  rowNumber: number; // 1-based sheet row of the repeated entry
  firstRow: number; // the earlier row it duplicates
  name: string;
  companyEmail: string | null;
}

interface Classified {
  toAdd: ImportedGuest[];
  toUpdate: UpdateEntry[];
  unchanged: number;
  duplicateInFile: number;
  duplicatesInFile: DuplicateRow[];
}

// Spreadsheet columns that can be updated on an existing guest (name + company
// email form the identity, so they're not updatable — a change there is a new
// person). Only non-empty spreadsheet values ever overwrite, so a re-upload
// never blanks out data.
const UPDATABLE: { key: keyof ImportedGuest; col: keyof ImportMatchPerson; label: string }[] =
  [
    { key: "contactNumber", col: "contact_number", label: "Contact number" },
    { key: "fullCompanyName", col: "full_company_name", label: "Company" },
    { key: "designation", col: "designation", label: "Designation" },
    { key: "invitedBy", col: "invited_by", label: "Invited by" },
    { key: "remarks", col: "remarks", label: "Remarks" },
  ];

function norm(v: unknown): string {
  return (v ?? "").toString().trim();
}

// Fields where the spreadsheet has a non-empty value that differs from the DB.
function diffGuest(guest: ImportedGuest, existing: ImportMatchPerson): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  for (const f of UPDATABLE) {
    const after = norm(guest[f.key]);
    const before = norm(existing[f.col]);
    if (after && after !== before) {
      diffs.push({
        field: f.key,
        label: f.label,
        before: (existing[f.col] as string | null) ?? null,
        after: (guest[f.key] as string | null) ?? null,
      });
    }
  }
  // Consent is upgrade-only: never revoke an existing consent from a re-upload.
  if (guest.consent && !existing.consent_at) {
    diffs.push({ field: "consent", label: "Consent", before: "no", after: "yes" });
  }
  return diffs;
}

// Split parsed rows into: new guests, existing guests whose data changed
// (with per-field diffs), unchanged existing guests, and rows repeated within
// the file. Identity is name + company email together (see dedupKey).
async function classify(guests: ImportedGuest[]): Promise<Classified> {
  const existing = await existingPeopleForImport();
  const seenRow = new Map<string, number>(); // dedup key -> first row it appeared

  const toAdd: ImportedGuest[] = [];
  const toUpdate: UpdateEntry[] = [];
  const duplicatesInFile: DuplicateRow[] = [];
  let unchanged = 0;

  for (const g of guests) {
    const key = dedupKey(g.name, g.companyEmail);
    const firstRow = seenRow.get(key);
    if (firstRow !== undefined) {
      duplicatesInFile.push({
        rowNumber: g.rowNumber,
        firstRow,
        name: g.name,
        companyEmail: g.companyEmail,
      });
      continue;
    }
    seenRow.set(key, g.rowNumber);

    const match = existing.get(key);
    if (match) {
      const diffs = diffGuest(g, match);
      if (diffs.length > 0) toUpdate.push({ guest: g, id: match.id, diffs });
      else unchanged++;
    } else {
      toAdd.push(g);
    }
  }

  return {
    toAdd,
    toUpdate,
    unchanged,
    duplicateInFile: duplicatesInFile.length,
    duplicatesInFile,
  };
}

function summarizeGuest(g: ImportedGuest) {
  return {
    name: g.name,
    companyEmail: g.companyEmail,
    fullCompanyName: g.fullCompanyName,
    designation: g.designation,
  };
}

// Bulk import/update guests from the registration .xlsx. New guests are inserted
// (empty embedding — they enrol a face later via /register — and a fresh unique
// QR); existing guests whose fields changed are updated. Nothing is written in
// preview mode.
//
// ?preview=1 -> parse + classify only, so the UI can show what will be added and
// which rows will change (before -> after) before the operator confirms.
export async function POST(request: Request) {
  const preview = new URL(request.url).searchParams.get("preview") === "1";

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected a multipart file upload." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json(
      { error: "Please choose an .xlsx file to upload." },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "File is too large (max 8 MB)." },
      { status: 413 },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());

  let guests: ImportedGuest[];
  try {
    guests = await parseGuestWorkbook(buf);
  } catch (e) {
    const msg =
      e instanceof ExcelParseError ? e.message : "Could not parse the spreadsheet.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  if (guests.length === 0) {
    return NextResponse.json(
      { error: "No guest rows found in the spreadsheet." },
      { status: 400 },
    );
  }

  const { toAdd, toUpdate, unchanged, duplicateInFile, duplicatesInFile } =
    await classify(guests);

  // Preview: report what would happen, write nothing.
  if (preview) {
    return NextResponse.json({
      ok: true,
      preview: true,
      total: guests.length,
      addCount: toAdd.length,
      updateCount: toUpdate.length,
      unchangedCount: unchanged,
      duplicateInFileCount: duplicateInFile,
      duplicatesInFile,
      toAdd: toAdd.map(summarizeGuest),
      toUpdate: toUpdate.map((u) => ({
        name: u.guest.name,
        companyEmail: u.guest.companyEmail,
        diffs: u.diffs,
      })),
    });
  }

  // Insert new guests. Sequential so each fresh QR sees the codes committed just
  // before it (no intra-batch collisions).
  let inserted = 0;
  const failed: string[] = [];
  for (const g of toAdd) {
    try {
      const qrCode = await generateUniqueQrCode();
      await createPerson({
        name: g.name,
        contactNumber: g.contactNumber,
        companyEmail: g.companyEmail,
        fullCompanyName: g.fullCompanyName,
        designation: g.designation,
        invitedBy: g.invitedBy,
        remarks: g.remarks,
        qrCode,
        consent: g.consent,
        // no embedding -> stored empty; guest enrols a face later via /register
      });
      inserted++;
    } catch {
      failed.push(g.name);
    }
  }

  // Apply updates: only the fields shown in the diff are changed.
  let updated = 0;
  for (const u of toUpdate) {
    try {
      const g = u.guest;
      const patch: Parameters<typeof updatePerson>[1] = {};
      for (const d of u.diffs) {
        if (d.field === "contactNumber") patch.contactNumber = g.contactNumber;
        else if (d.field === "fullCompanyName") patch.fullCompanyName = g.fullCompanyName;
        else if (d.field === "designation") patch.designation = g.designation;
        else if (d.field === "invitedBy") patch.invitedBy = g.invitedBy;
        else if (d.field === "remarks") patch.remarks = g.remarks;
      }
      if (Object.keys(patch).length > 0) await updatePerson(u.id, patch);
      if (u.diffs.some((d) => d.field === "consent")) await setConsentAt(u.id);
      updated++;
    } catch {
      failed.push(u.guest.name);
    }
  }

  return NextResponse.json({
    ok: true,
    total: guests.length,
    inserted,
    updated,
    unchanged,
    skippedDuplicate: duplicateInFile,
    failed: failed.length,
    failedNames: failed.slice(0, 50),
  });
}
