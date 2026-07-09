import ExcelJS from "exceljs";
import JSZip from "jszip";

// Parses the guest-registration spreadsheet (the "[Registration] … Birthday
// Party" export) into normalized rows. Column order is NOT assumed — we map by
// header text so a re-ordered export still imports correctly.

export interface ImportedGuest {
  name: string;
  contactNumber: string | null;
  companyEmail: string | null;
  fullCompanyName: string | null;
  designation: string | null;
  invitedBy: string | null;
  remarks: string | null;
  consent: boolean;
  rowNumber: number; // 1-based sheet row, for error reporting
}

// Header text (lowercased, stripped of punctuation/whitespace) -> field, with a
// match STRENGTH. Higher strength wins, so when an export has both a generic
// "Name" column (the MS Forms responder identity, usually blank) and a "Full
// Name" question column, we bind to "Full Name". Returns 0 for no match.
const HEADER_MATCHERS: { field: keyof ColumnMap; score: (h: string) => number }[] =
  [
    // "fullname" is the real answer; a bare "name" column is a weak fallback.
    { field: "name", score: (h) => (h.includes("fullname") ? 2 : h === "name" ? 1 : 0) },
    { field: "contactNumber", score: (h) => (h.includes("contact") || h.includes("mobile") || h.includes("phone") ? 1 : 0) },
    { field: "companyEmail", score: (h) => (h.includes("companyemail") ? 1 : 0) },
    { field: "fullCompanyName", score: (h) => (h.includes("companyname") || h.includes("fullcompany") ? 1 : 0) },
    { field: "designation", score: (h) => (h.includes("designation") || h.includes("jobtitle") || h.includes("title") ? 1 : 0) },
    { field: "invitedBy", score: (h) => (h.includes("invitedby") || h.includes("invited") ? 1 : 0) },
    { field: "remarks", score: (h) => (h.includes("remark") || h.includes("note") ? 1 : 0) },
    { field: "consent", score: (h) => (h.includes("consent") ? 1 : 0) },
  ];

interface ColumnMap {
  name: number;
  contactNumber: number;
  companyEmail: number;
  fullCompanyName: number;
  designation: number;
  invitedBy: number;
  remarks: number;
  consent: number;
}

const TRUTHY_CONSENT = new Set(["yes", "y", "true", "1", "on", "agree", "consent"]);

function norm(h: unknown): string {
  return String(h ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function cellText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") {
    // ExcelJS rich text / hyperlink / formula result objects.
    const o = v as Record<string, unknown>;
    if (typeof o.text === "string") return o.text.trim();
    if (typeof o.result === "string") return o.result.trim();
    if (Array.isArray(o.richText))
      return (o.richText as { text?: string }[]).map((r) => r.text ?? "").join("").trim();
    if (o.hyperlink && typeof o.text === "string") return String(o.text).trim();
  }
  return String(v).trim();
}

export class ExcelParseError extends Error {}

const MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

// Some exporters (e.g. Microsoft Forms / .NET OpenXML) write valid but atypical
// OOXML that ExcelJS's strict parser rejects: the main SpreadsheetML namespace
// is bound to an "x:" prefix (so every tag is <x:workbook>, <x:row>, <x:c>…),
// and docProps/core.xml uses unprefixed core-property tags. This rewrites the
// buffer into the plain form ExcelJS expects — strip the main-ns prefix, drop
// the unparseable core.xml, and drop table definitions (we only read cells).
async function repairWorkbookBuffer(buf: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buf);

  // Metadata part ExcelJS can choke on; it is optional, so just remove it.
  zip.remove("docProps/core.xml");
  // Table definitions aren't needed to read values and add their own parse path.
  for (const path of Object.keys(zip.files)) {
    if (path.startsWith("xl/tables/")) zip.remove(path);
  }

  const escNs = MAIN_NS.replace(/[/.]/g, "\\$&");
  for (const path of Object.keys(zip.files)) {
    if (!path.endsWith(".xml") || !path.startsWith("xl/")) continue;
    let xml = await zip.file(path)!.async("string");

    // If the main namespace is bound to a prefix, strip it from every tag so
    // ExcelJS sees the conventional unprefixed element names.
    const m = xml.match(new RegExp(`xmlns:([A-Za-z0-9]+)="${escNs}"`));
    if (m) {
      const p = m[1];
      xml = xml
        .split(`<${p}:`).join("<")
        .split(`</${p}:`).join("</")
        .replace(new RegExp(`xmlns:${p}="${escNs}"`), `xmlns="${MAIN_NS}"`);
    }

    // Drop references to the table parts we removed above.
    if (/worksheets\/sheet\d+\.xml$/.test(path)) {
      xml = xml
        .replace(/<tableParts[\s\S]*?<\/tableParts>/gi, "")
        .replace(/<tableParts[^>]*\/>/gi, "");
    }
    zip.file(path, xml);
  }

  // Remove the now-dangling table relationships so ExcelJS doesn't seek them.
  for (const path of Object.keys(zip.files)) {
    if (!/worksheets\/_rels\/.*\.rels$/.test(path)) continue;
    const rels = await zip.file(path)!.async("string");
    zip.file(path, rels.replace(/<Relationship\b[^>]*\/table\d+\.xml[^>]*\/>/gi, ""));
  }

  return zip.generateAsync({ type: "nodebuffer" });
}

async function loadWorkbook(buf: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  // exceljs's published types expect a non-generic Buffer; Node's Buffer is now
  // Buffer<ArrayBufferLike>. Bridge the mismatch via the method's own param type.
  await wb.xlsx.load(buf as unknown as Parameters<typeof wb.xlsx.load>[0]);
  return wb;
}

export async function parseGuestWorkbook(buf: Buffer): Promise<ImportedGuest[]> {
  let wb: ExcelJS.Workbook;
  try {
    wb = await loadWorkbook(buf);
  } catch {
    // Retry once via the repair path for atypical-but-valid exports.
    try {
      wb = await loadWorkbook(await repairWorkbookBuffer(buf));
    } catch {
      throw new ExcelParseError("Could not read the file as an .xlsx workbook.");
    }
  }
  const ws = wb.worksheets[0];
  if (!ws || ws.rowCount === 0) {
    throw new ExcelParseError("The spreadsheet has no sheets or rows.");
  }

  // Find the header row within the first few rows (some exports have a title row).
  // Each field binds to the highest-scoring column, so a "Full Name" column beats
  // a bare (often empty) "Name" one regardless of their order.
  let headerRowIdx = -1;
  let colMap: Partial<ColumnMap> = {};
  const maxScan = Math.min(ws.rowCount, 8);
  for (let r = 1; r <= maxScan; r++) {
    const row = ws.getRow(r);
    const map: Partial<ColumnMap> = {};
    const bestScore: Partial<Record<keyof ColumnMap, number>> = {};
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const h = norm(cellText(cell.value));
      if (!h) return;
      for (const m of HEADER_MATCHERS) {
        const s = m.score(h);
        if (s > 0 && s > (bestScore[m.field] ?? 0)) {
          bestScore[m.field] = s;
          map[m.field] = colNumber;
        }
      }
    });
    if (map.name !== undefined) {
      headerRowIdx = r;
      colMap = map;
      break;
    }
  }

  if (headerRowIdx === -1 || colMap.name === undefined) {
    throw new ExcelParseError(
      'Could not find a "Full Name" column. Check the spreadsheet headers.',
    );
  }

  const get = (row: ExcelJS.Row, col: number | undefined): string | null => {
    if (col === undefined) return null;
    const t = cellText(row.getCell(col).value);
    return t === "" ? null : t;
  };

  const guests: ImportedGuest[] = [];
  for (let r = headerRowIdx + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const name = get(row, colMap.name);
    // Skip fully blank rows and rows without a name.
    if (!name) continue;

    const consentText = colMap.consent !== undefined ? (get(row, colMap.consent) ?? "") : "";
    guests.push({
      name,
      contactNumber: get(row, colMap.contactNumber),
      companyEmail: get(row, colMap.companyEmail),
      fullCompanyName: get(row, colMap.fullCompanyName),
      designation: get(row, colMap.designation),
      invitedBy: get(row, colMap.invitedBy),
      remarks: get(row, colMap.remarks),
      consent: TRUTHY_CONSENT.has(norm(consentText)),
      rowNumber: r,
    });
  }

  return guests;
}
