import mysql from "mysql2/promise";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import { pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto";
import { config } from "./config";

// Reuse a single pool across hot-reloads / requests (module-global in the Node server).
declare global {
  // eslint-disable-next-line no-var
  var __crowPool: mysql.Pool | undefined;
}

export const pool: mysql.Pool =
  global.__crowPool ??
  mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    waitForConnections: true,
    connectionLimit: 5,
    enableKeepAlive: true,
  });

if (process.env.NODE_ENV !== "production") global.__crowPool = pool;

// ---------- row types ----------

export interface PersonRow extends RowDataPacket {
  id: number;
  name: string;
  email: string | null;
  contact_number: string | null;
  company_email: string | null;
  full_company_name: string | null;
  designation: string | null;
  invited_by: string | null;
  details: unknown | null;
  remarks: string | null;
  photo_path: string | null;
  qr_code_path: string | null;
  embedding: Buffer | null;
  consent_at: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface EmbeddingRow extends RowDataPacket {
  id: number;
  embedding: Buffer;
}

export interface CheckinRow extends RowDataPacket {
  id: number;
  person_id: number;
  name: string;
  score: number;
  method: string | null; // 'face' | 'manual' | 'qr'; null for legacy rows
  checked_in_at: string;
}

const PERSON_COLS = [
  "id",
  "name",
  "email",
  "contact_number",
  "company_email",
  "full_company_name",
  "designation",
  "invited_by",
  "details",
  "remarks",
  "photo_path",
  "qr_code_path",
  "embedding",
  "consent_at",
  "created_at",
  "updated_at",
].join(", ");

// ---------- people ----------

// Guests imported from the registration spreadsheet have no face yet — they get
// the /register link later (optional face enrolment). Their embedding column is
// empty (0 bytes) until then; NOT-NULL varbinary is satisfied by an empty value.
const EMPTY_EMBEDDING = Buffer.alloc(0);

export async function createPerson(p: {
  name: string;
  email?: string | null;
  contactNumber?: string | null;
  companyEmail?: string | null;
  fullCompanyName?: string | null;
  designation?: string | null;
  invitedBy?: string | null;
  details?: string | null; // JSON string or null (legacy)
  remarks?: string | null;
  qrCode?: string | null;
  embedding?: Buffer; // raw 2048 bytes (512 x float32 LE); empty for un-enrolled imports
  consent: boolean;
}): Promise<number> {
  const [res] = await pool.execute<ResultSetHeader>(
    `INSERT INTO project_crow_people
       (name, email, contact_number, company_email, full_company_name,
        designation, invited_by, details, remarks, qr_code_path, embedding, consent_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      p.name,
      p.email ?? null,
      p.contactNumber ?? null,
      p.companyEmail ?? null,
      p.fullCompanyName ?? null,
      p.designation ?? null,
      p.invitedBy ?? null,
      p.details ?? null,
      p.remarks ?? null,
      p.qrCode ?? null,
      p.embedding ?? EMPTY_EMBEDDING,
      p.consent ? new Date() : null,
    ],
  );
  return res.insertId;
}

const QR_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function randomQrCode(): string {
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += QR_CHARS.charAt(Math.floor(Math.random() * QR_CHARS.length));
  }
  return code;
}

export async function generateUniqueQrCode(): Promise<string> {
  let code = randomQrCode();
  while (await qrCodeExists(code)) {
    code = randomQrCode();
  }
  return code;
}

export async function qrCodeExists(code: string): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 FROM project_crow_people WHERE qr_code_path = ? LIMIT 1`,
    [code],
  );
  return rows.length > 0;
}

// Look up a guest by the unique code embedded in their QR (stored in
// qr_code_path). Used by the QR check-in kiosk (/api/checkin/qr).
export async function getPersonByQrCode(
  code: string,
): Promise<PersonRow | null> {
  const [rows] = await pool.query<PersonRow[]>(
    `SELECT ${PERSON_COLS} FROM project_crow_people WHERE qr_code_path = ? LIMIT 1`,
    [code],
  );
  return rows[0] ?? null;
}

export async function setPhotoPath(
  id: number,
  photoPath: string,
): Promise<void> {
  await pool.execute(
    `UPDATE project_crow_people SET photo_path = ? WHERE id = ?`,
    [photoPath, id],
  );
}

export async function getPerson(id: number): Promise<PersonRow | null> {
  const [rows] = await pool.query<PersonRow[]>(
    `SELECT ${PERSON_COLS} FROM project_crow_people WHERE id = ?`,
    [id],
  );
  return rows[0] ?? null;
}

export async function findPersonByNameAndCompanyEmail(
  name: string,
  companyEmail: string,
): Promise<PersonRow | null> {
  const [rows] = await pool.query<PersonRow[]>(
    `SELECT ${PERSON_COLS} FROM project_crow_people WHERE name = ? AND company_email = ? ORDER BY id DESC LIMIT 1`,
    [name.trim(), companyEmail.trim()],
  );
  return rows[0] ?? null;
}

export async function setEmbeddingAndPhoto(
  id: number,
  embedding: Buffer,
  photoPath: string,
): Promise<void> {
  await pool.execute(
    `UPDATE project_crow_people SET embedding = ?, photo_path = ? WHERE id = ?`,
    [embedding, photoPath, id],
  );
}

export async function setConsentAt(id: number): Promise<void> {
  await pool.execute(
    `UPDATE project_crow_people SET consent_at = ? WHERE id = ?`,
    [new Date(), id],
  );
}

export async function listPeople(): Promise<PersonRow[]> {
  const [rows] = await pool.query<PersonRow[]>(
    `SELECT ${PERSON_COLS} FROM project_crow_people ORDER BY name ASC`,
  );
  return rows;
}

export async function deletePerson(id: number): Promise<PersonRow | null> {
  const person = await getPerson(id);
  if (!person) return null;
  await pool.execute(`DELETE FROM project_crow_people WHERE id = ?`, [id]);
  return person;
}

export async function countPeople(): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM project_crow_people`,
  );
  return Number(rows[0].c);
}

/**
 * (id, embedding) rows for enrolled faces only — used to (re)hydrate the
 * baremetal matrix. Imported guests who haven't done face registration have an
 * empty (0-byte) embedding; they must be excluded or the matrix would try to
 * load zero-length vectors. Only full 2048-byte embeddings are real faces.
 */
export async function allEmbeddings(): Promise<EmbeddingRow[]> {
  const [rows] = await pool.query<EmbeddingRow[]>(
    `SELECT id, embedding FROM project_crow_people
      WHERE LENGTH(embedding) = 2048 ORDER BY id ASC`,
  );
  return rows;
}

/**
 * Count of people with an enrolled face (full embedding). This — not the total
 * head-count — is what the baremetal matrix holds, so it's the correct number
 * for matrix drift detection once photo-less imported guests exist.
 */
export async function countEmbeddedPeople(): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM project_crow_people WHERE LENGTH(embedding) = 2048`,
  );
  return Number(rows[0].c);
}

// A person's identity for dedup: name + company email together. Two rows are
// only duplicates when BOTH match — so different people who happen to share a
// company inbox (e.g. one person registering on another's email) are NOT merged.
// When there's no email, the name alone is the key.
export function dedupKey(
  name: string | null,
  email: string | null,
): string {
  const n = (name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const e = (email ?? "").trim().toLowerCase();
  return e ? `${n}|${e}` : `name:${n}`;
}

// Dedup keys for every current person, so a spreadsheet import can skip guests
// already in the DB.
export async function existingDedupKeys(): Promise<Set<string>> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT name, company_email FROM project_crow_people`,
  );
  const keys = new Set<string>();
  for (const r of rows) keys.add(dedupKey(r.name, r.company_email));
  return keys;
}

// The subset of a person's fields the spreadsheet import compares against, so an
// upload can detect which existing guests have changed and update them.
export interface ImportMatchPerson {
  id: number;
  name: string;
  contact_number: string | null;
  company_email: string | null;
  full_company_name: string | null;
  designation: string | null;
  invited_by: string | null;
  remarks: string | null;
  consent_at: string | null;
}

// All current people indexed by dedup key (name + company email), for the import
// upsert: matched keys become updates (if any field differs) instead of skips.
export async function existingPeopleForImport(): Promise<
  Map<string, ImportMatchPerson>
> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, name, contact_number, company_email, full_company_name,
            designation, invited_by, remarks, consent_at
       FROM project_crow_people`,
  );
  const map = new Map<string, ImportMatchPerson>();
  for (const r of rows) {
    map.set(dedupKey(r.name, r.company_email), {
      id: r.id,
      name: r.name,
      contact_number: r.contact_number,
      company_email: r.company_email,
      full_company_name: r.full_company_name,
      designation: r.designation,
      invited_by: r.invited_by,
      remarks: r.remarks,
      consent_at: r.consent_at,
    });
  }
  return map;
}

export async function updatePerson(
  id: number,
  p: {
    name?: string;
    email?: string | null;
    contactNumber?: string | null;
    companyEmail?: string | null;
    fullCompanyName?: string | null;
    designation?: string | null;
    invitedBy?: string | null;
    remarks?: string | null;
  },
): Promise<boolean> {
  const sets: string[] = [];
  const vals: (string | number | null)[] = [];

  if (p.name !== undefined) {
    sets.push("name = ?");
    vals.push(p.name);
  }
  if (p.email !== undefined) {
    sets.push("email = ?");
    vals.push(p.email);
  }
  if (p.contactNumber !== undefined) {
    sets.push("contact_number = ?");
    vals.push(p.contactNumber);
  }
  if (p.companyEmail !== undefined) {
    sets.push("company_email = ?");
    vals.push(p.companyEmail);
  }
  if (p.fullCompanyName !== undefined) {
    sets.push("full_company_name = ?");
    vals.push(p.fullCompanyName);
  }
  if (p.designation !== undefined) {
    sets.push("designation = ?");
    vals.push(p.designation);
  }
  if (p.invitedBy !== undefined) {
    sets.push("invited_by = ?");
    vals.push(p.invitedBy);
  }
  if (p.remarks !== undefined) {
    sets.push("remarks = ?");
    vals.push(p.remarks);
  }

  if (sets.length === 0) return false;
  vals.push(id);

  const [res] = await pool.execute<ResultSetHeader>(
    `UPDATE project_crow_people SET ${sets.join(", ")} WHERE id = ?`,
    vals,
  );
  return res.affectedRows > 0;
}

// ---------- checkins ----------

// method records how the check-in happened: 'face' (operator/kiosk recognition),
// 'self' (guest self-check-in on /checkin), 'manual' (operator picked from
// the list), or 'qr' (QR-code kiosk). Kept alongside the face-match score so the
// admin check-in table can show the method.
export type CheckinMethod = "face" | "self" | "manual" | "qr";

export async function logCheckin(
  personId: number,
  score: number,
  method: CheckinMethod,
): Promise<number> {
  const [res] = await pool.execute<ResultSetHeader>(
    `INSERT INTO project_crow_checkins (person_id, score, method) VALUES (?, ?, ?)`,
    [personId, score, method],
  );
  return res.insertId;
}

// Most recent check-in for one person, or null if they've never checked in.
// Used by /api/confirm to enforce one check-in per person — a second attempt
// is reported back to the kiosk as "already checked in" instead of inserting.
export async function latestCheckinForPerson(
  personId: number,
): Promise<CheckinRow | null> {
  const [rows] = await pool.query<CheckinRow[]>(
    `SELECT c.id, c.person_id, p.name, c.score, c.method, c.checked_in_at
       FROM project_crow_checkins c
       JOIN project_crow_people p ON p.id = c.person_id
      WHERE c.person_id = ?
      ORDER BY c.checked_in_at DESC
      LIMIT 1`,
    [personId],
  );
  return rows[0] ?? null;
}

export async function recentCheckins(limit = 50): Promise<CheckinRow[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit) || 0, 1), 500);
  const [rows] = await pool.query<CheckinRow[]>(
    `SELECT c.id, c.person_id, p.name, c.score, c.method, c.checked_in_at
       FROM project_crow_checkins c
       JOIN project_crow_people p ON p.id = c.person_id
      ORDER BY c.checked_in_at DESC
      LIMIT ${safeLimit}`,
  );
  return rows;
}

// ---------- stats (admin dashboard) ----------

export async function countCheckins(): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM project_crow_checkins`,
  );
  return Number(rows[0].c);
}

export async function countCheckinsSince(date: Date): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM project_crow_checkins WHERE checked_in_at >= ?`,
    [date],
  );
  return Number(rows[0].c);
}

// Check-ins since local midnight (server timezone). Used for the "today" stat.
export async function countCheckinsToday(): Promise<number> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return countCheckinsSince(start);
}

// Distinct people who have ever checked in — the denominator for no-show.
export async function distinctCheckedInPersonCount(): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(DISTINCT person_id) AS c FROM project_crow_checkins`,
  );
  return Number(rows[0].c);
}

// Full check-in history for one person (admin drawer). Same shape as recentCheckins.
export async function checkinsForPerson(
  personId: number,
  limit = 100,
): Promise<CheckinRow[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit) || 0, 1), 500);
  const [rows] = await pool.query<CheckinRow[]>(
    `SELECT c.id, c.person_id, p.name, c.score, c.method, c.checked_in_at
       FROM project_crow_checkins c
       JOIN project_crow_people p ON p.id = c.person_id
      WHERE c.person_id = ?
      ORDER BY c.checked_in_at DESC
      LIMIT ${safeLimit}`,
    [personId],
  );
  return rows;
}

export async function deleteCheckin(id: number): Promise<boolean> {
  const [res] = await pool.execute<ResultSetHeader>(
    `DELETE FROM project_crow_checkins WHERE id = ?`,
    [id],
  );
  return res.affectedRows > 0;
}

// ---------- admin users ----------

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEYLEN = 64;
const PBKDF2_DIGEST = "sha512";

export interface AdminRow extends RowDataPacket {
  id: number;
  email: string;
  password_hash: string;
  created_at: string;
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("base64");
  const hash = pbkdf2Sync(
    password,
    salt,
    PBKDF2_ITERATIONS,
    PBKDF2_KEYLEN,
    PBKDF2_DIGEST,
  ).toString("base64");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const computed = pbkdf2Sync(
    password,
    salt,
    PBKDF2_ITERATIONS,
    PBKDF2_KEYLEN,
    PBKDF2_DIGEST,
  );
  const expected = Buffer.from(hash, "base64");
  if (computed.length !== expected.length) return false;
  return timingSafeEqual(computed, expected);
}

export async function createAdmin(p: {
  email: string;
  password: string;
}): Promise<number> {
  const [res] = await pool.execute<ResultSetHeader>(
    `INSERT INTO project_crow_admins (email, password_hash) VALUES (?, ?)`,
    [p.email.trim().toLowerCase(), hashPassword(p.password)],
  );
  return res.insertId;
}

export async function findAdminByEmail(email: string): Promise<AdminRow | null> {
  const [rows] = await pool.query<AdminRow[]>(
    `SELECT id, email, password_hash, created_at FROM project_crow_admins WHERE email = ? ORDER BY id DESC LIMIT 1`,
    [email.trim().toLowerCase()],
  );
  return rows[0] ?? null;
}

export async function listAdmins(): Promise<AdminRow[]> {
  const [rows] = await pool.query<AdminRow[]>(
    `SELECT id, email, password_hash, created_at FROM project_crow_admins ORDER BY email ASC`,
  );
  return rows;
}

export async function deleteAdmin(id: number): Promise<boolean> {
  const [res] = await pool.execute<ResultSetHeader>(
    `DELETE FROM project_crow_admins WHERE id = ?`,
    [id],
  );
  return res.affectedRows > 0;
}

export async function updateAdminPassword(
  id: number,
  password: string,
): Promise<boolean> {
  const [res] = await pool.execute<ResultSetHeader>(
    `UPDATE project_crow_admins SET password_hash = ? WHERE id = ?`,
    [hashPassword(password), id],
  );
  return res.affectedRows > 0;
}

export async function countAdmins(): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM project_crow_admins`,
  );
  return Number(rows[0].c);
}
