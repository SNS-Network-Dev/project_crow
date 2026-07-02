import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { config } from "./config";

// Strip anything that isn't a safe filename char — prevents path traversal when a
// DB-stored photo_path is used to read from disk.
function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "");
}

async function ensureDir(): Promise<void> {
  await mkdir(config.photoDir, { recursive: true });
}

/** Save a registration JPEG as `<id>.jpg`; returns the stored filename. */
export async function savePhoto(personId: number, bytes: Buffer): Promise<string> {
  await ensureDir();
  const filename = `${personId}.jpg`;
  await writeFile(join(config.photoDir, filename), bytes);
  return filename;
}

export async function readPhoto(filename: string): Promise<Buffer | null> {
  try {
    return await readFile(join(config.photoDir, sanitize(filename)));
  } catch {
    return null;
  }
}

export async function deletePhoto(filename: string): Promise<void> {
  try {
    await unlink(join(config.photoDir, sanitize(filename)));
  } catch {
    /* already gone — fine */
  }
}
