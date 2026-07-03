import mysql from "mysql2/promise";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
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
  "consent_at",
  "created_at",
  "updated_at",
].join(", ");

// ---------- people ----------

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
  embedding: Buffer; // raw 2048 bytes (512 x float32 LE)
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
      p.embedding,
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

/** All (id, embedding) rows — used to (re)hydrate the baremetal matrix. */
export async function allEmbeddings(): Promise<EmbeddingRow[]> {
  const [rows] = await pool.query<EmbeddingRow[]>(
    `SELECT id, embedding FROM project_crow_people ORDER BY id ASC`,
  );
  return rows;
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

export async function logCheckin(
  personId: number,
  score: number,
): Promise<number> {
  const [res] = await pool.execute<ResultSetHeader>(
    `INSERT INTO project_crow_checkins (person_id, score) VALUES (?, ?)`,
    [personId, score],
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
    `SELECT c.id, c.person_id, p.name, c.score, c.checked_in_at
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
    `SELECT c.id, c.person_id, p.name, c.score, c.checked_in_at
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
    `SELECT c.id, c.person_id, p.name, c.score, c.checked_in_at
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
