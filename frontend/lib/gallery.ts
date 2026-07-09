import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "./config";

// The avatar "live wall" store. Capture is synchronous (the /avatar station blocks
// on generation, which self-throttles the serialized GPU); when a set of poster(s)
// finishes it is appended here. The gallery station polls listSets() to show the
// newest captures, and guests pick + get a QR to download on their phone.
//
// This is a derived, ephemeral event log — just references into POSTERS_DIR (the
// PNG bytes already live there). Stored as one JSON file next to the posters.

export interface GalleryPosterRef {
  id: string; // poster id -> <POSTERS_DIR>/<id>.png
  variant: string | null; // "arm-around" | "pose-follow" | "group" | null
  seed: number | null;
}

export interface GallerySet {
  id: string;
  createdAt: number; // epoch ms
  mode: "kelvin" | "group";
  posters: GalleryPosterRef[];
}

const STORE = join(dirname(config.postersDir), "gallery.json");

async function readStore(): Promise<GallerySet[]> {
  try {
    const raw = await readFile(STORE, "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? (data as GallerySet[]) : [];
  } catch {
    return []; // missing/corrupt -> empty wall
  }
}

// Serialize read-modify-write so concurrent appends can't clobber the file. The
// bridge is a single Node process and captures are effectively serialized by the
// blocking UI, but a promise chain makes it correct regardless.
let chain: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

/** Append a finished capture (its poster set) to the wall. Returns the new set. */
export function appendSet(
  mode: GallerySet["mode"],
  posters: GalleryPosterRef[],
): Promise<GallerySet> {
  return serialize(async () => {
    const set: GallerySet = { id: randomUUID(), createdAt: Date.now(), mode, posters };
    const all = await readStore();
    all.push(set);
    await mkdir(dirname(STORE), { recursive: true });
    await writeFile(STORE, JSON.stringify(all));
    return set;
  });
}

/** Newest-first sets for the live wall (capped so an all-night event stays snappy). */
export async function listSets(limit = 60): Promise<GallerySet[]> {
  const all = await readStore();
  return all.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
}

/**
 * Remove one poster from the wall. Drops its reference from whatever set holds
 * it, prunes any set left empty, and rewrites the store. Returns true if a poster
 * was actually removed. The caller deletes the PNG file separately.
 */
export function removePoster(posterId: string): Promise<boolean> {
  return serialize(async () => {
    const all = await readStore();
    let removed = false;
    for (const set of all) {
      const before = set.posters.length;
      set.posters = set.posters.filter((p) => p.id !== posterId);
      if (set.posters.length !== before) removed = true;
    }
    if (!removed) return false;
    const pruned = all.filter((s) => s.posters.length > 0);
    await mkdir(dirname(STORE), { recursive: true });
    await writeFile(STORE, JSON.stringify(pruned));
    return true;
  });
}

// ---- stateless selection tokens (for the phone download link) ----
// A guest's picked poster ids are encoded straight into the QR URL — no
// server-side token table. Poster ids are random UUIDs (unguessable capability),
// so /d/<token> is safe to expose publicly.

const ID_RE = /^[a-zA-Z0-9._-]{8,64}$/;

export function encodeSelection(ids: string[]): string {
  return Buffer.from(ids.filter((id) => ID_RE.test(id)).join(",")).toString("base64url");
}

export function decodeSelection(token: string): string[] {
  try {
    const s = Buffer.from(token, "base64url").toString("utf8");
    return s.split(",").filter((id) => ID_RE.test(id));
  } catch {
    return [];
  }
}
