import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { config } from "./config";

// Generated avatar posters live on the bridge filesystem (config.postersDir), out of
// the docroot, and are served through /api/posters/[id] — mirrors lib/photos.ts.

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "");
}

/** Save a poster PNG as `<id>.png`; returns the stored filename. */
export async function savePoster(id: string, bytes: Buffer): Promise<string> {
  await mkdir(config.postersDir, { recursive: true });
  const filename = `${sanitize(id)}.png`;
  await writeFile(join(config.postersDir, filename), bytes);
  return filename;
}

export async function readPoster(id: string): Promise<Buffer | null> {
  try {
    return await readFile(join(config.postersDir, `${sanitize(id)}.png`));
  } catch {
    return null;
  }
}

/** Delete a poster PNG. Best-effort: returns false if it was already gone. */
export async function deletePoster(id: string): Promise<boolean> {
  try {
    await unlink(join(config.postersDir, `${sanitize(id)}.png`));
    return true;
  } catch {
    return false;
  }
}
