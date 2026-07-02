import { Agent } from "undici";
import { config } from "./config";
import { allEmbeddings, countPeople } from "./db";

// Client for the baremetal face-compute service (see baremetal-contract.md).
// Only this bridge ever calls baremetal; the browser never does.
//
// House convention (see project_centaur): baremetal FastAPI services sit behind
// nginx on the GPU host (e.g. https://103.47.130.195/crow-api/api) with a
// SELF-SIGNED cert. So we attach an undici dispatcher that skips TLS verification
// for these calls only (scoped, not the global NODE_TLS_REJECT_UNAUTHORIZED).
// Auth is OPTIONAL (centaur uses none); we add a bearer header only if a token
// is configured.

const BASE = config.baremetal.url;

// Secure by default. The GPU host (per project_centaur) currently serves a
// self-signed cert; to talk to it you must OPT IN with BAREMETAL_INSECURE_TLS=true.
// We never disable TLS verification implicitly.
const insecureTls = (process.env.BAREMETAL_INSECURE_TLS ?? "false").toLowerCase() === "true";
const insecureDispatcher =
  insecureTls && BASE.startsWith("https:") ? new Agent({ connect: { rejectUnauthorized: false } }) : undefined;

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { ...(extra ?? {}) };
  if (config.baremetal.token) h.Authorization = `Bearer ${config.baremetal.token}`;
  return h;
}

async function bm(path: string, init: RequestInit): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init.headers as Record<string, string>) },
    cache: "no-store",
    // undici-specific: skip verification of the self-signed baremetal cert.
    ...(insecureDispatcher ? { dispatcher: insecureDispatcher } : {}),
  } as RequestInit & { dispatcher?: unknown });
}

export interface BMHealth {
  ok: boolean;
  model_ready: boolean;
  matrix_count: number;
  epoch: string;
}

export interface BMCandidate {
  person_id: number;
  score: number;
  confident: boolean;
}

/** Thrown on QC rejection (422) — message is safe to show the end user. */
export class BMEnrollError extends Error {}

/** Thrown on avatar-generation QC/decode/size failure — message is end-user-safe. */
export class BMAvatarError extends Error {}

export async function health(): Promise<BMHealth> {
  const res = await bm("/health", { method: "GET" });
  if (!res.ok) throw new Error(`baremetal /health ${res.status}`);
  return res.json();
}

/** Strict enrollment path. Returns the raw 2048-byte embedding. */
export async function embedEnroll(photo: Blob): Promise<Buffer> {
  const fd = new FormData();
  fd.append("photo", photo, "photo.jpg");
  const res = await bm("/embed/enroll", { method: "POST", body: fd });
  if (res.status === 422 || res.status === 400) {
    const body = await res.json().catch(() => ({ error: "Enrollment failed." }));
    throw new BMEnrollError(body.error ?? "Enrollment failed.");
  }
  if (!res.ok) throw new Error(`baremetal /embed/enroll ${res.status}`);
  const body = (await res.json()) as { embedding: string };
  return Buffer.from(body.embedding, "base64");
}

/** Lenient check-in path. Returns top-K candidates (person_id + score). */
export async function checkin(frame: Blob): Promise<BMCandidate[]> {
  const fd = new FormData();
  fd.append("frame", frame, "frame.jpg");
  const res = await bm("/checkin", { method: "POST", body: fd });
  if (!res.ok) throw new Error(`baremetal /checkin ${res.status}`);
  const body = (await res.json()) as { candidates?: BMCandidate[] };
  return body.candidates ?? [];
}

/**
 * Avatar-generation path (see avatar-gen-contract.md). Sends one full-body photo,
 * returns the decoded PNG bytes of the stylized, transparent-background figure
 * (canonically 1024x1536). The bridge then composites it onto the event template.
 * Generation is slow, so we allow a generous timeout via AbortSignal.
 */
export async function generateAvatar(
  photo: Blob,
  opts?: { style?: string; seed?: number; timeoutMs?: number },
): Promise<Buffer> {
  const fd = new FormData();
  fd.append("photo", photo, "photo.jpg");
  if (opts?.style) fd.append("style", opts.style);
  if (opts?.seed != null) fd.append("seed", String(opts.seed));

  const res = await bm("/avatar/generate", {
    method: "POST",
    body: fd,
    signal: AbortSignal.timeout(opts?.timeoutMs ?? 120_000),
  });
  // 422 (QC: no/multiple person), 400 (decode/unknown style), 413 (too large) carry
  // an end-user-safe message; surface them as BMAvatarError.
  if (res.status === 422 || res.status === 400 || res.status === 413) {
    const body = await res.json().catch(() => ({ error: "Generation failed." }));
    throw new BMAvatarError(body.error ?? "Generation failed.");
  }
  if (!res.ok) throw new Error(`baremetal /avatar/generate ${res.status}`);
  const body = (await res.json()) as { image: string };
  return Buffer.from(body.image, "base64");
}

export async function matrixAdd(personId: number, embedding: Buffer): Promise<void> {
  const res = await bm("/matrix/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ person_id: personId, embedding: embedding.toString("base64") }),
  });
  if (!res.ok) throw new Error(`baremetal /matrix/add ${res.status}`);
}

export async function matrixRemove(personId: number): Promise<void> {
  const res = await bm("/matrix/remove", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ person_id: personId }),
  });
  if (!res.ok) throw new Error(`baremetal /matrix/remove ${res.status}`);
}

export async function matrixLoad(items: { person_id: number; embedding: string }[]): Promise<void> {
  const res = await bm("/matrix/load", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  if (!res.ok) throw new Error(`baremetal /matrix/load ${res.status}`);
}

// ---------- matrix sync ----------
// The baremetal matrix is a derived cache of MySQL. We detect a baremetal restart
// (new `epoch`) or any drift (matrix_count != DB count) and re-load the full matrix.
// Health is polled at most once per HEALTH_TTL_MS to avoid hammering on every checkin.

let lastEpoch: string | null = null;
let lastCheck = 0;
const HEALTH_TTL_MS = 5000;

export async function ensureMatrixSynced(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastCheck < HEALTH_TTL_MS) return;
  lastCheck = now;

  let h: BMHealth;
  try {
    h = await health();
  } catch {
    // baremetal unreachable — let the caller proceed and surface its own error
    lastEpoch = null;
    return;
  }

  const dbCount = await countPeople();
  if (h.epoch !== lastEpoch || h.matrix_count !== dbCount) {
    const rows = await allEmbeddings();
    await matrixLoad(rows.map((r) => ({ person_id: r.id, embedding: r.embedding.toString("base64") })));
    lastEpoch = h.epoch;
  }
}
