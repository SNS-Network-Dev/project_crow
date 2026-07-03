import { promises as fs } from "fs";
import { join } from "path";

// Lightweight server-side settings store (JSON file). Used for admin toggles
// that don't justify a database table, e.g. the early-check-in countdown timer.

const DEFAULTS: AppSettings = {
  earlyCheckinCountdownEnabled: false,
  earlyCheckinTargetIso: "2025-07-17T17:00:00+08:00", // one hour before 6pm
};

export interface AppSettings {
  earlyCheckinCountdownEnabled: boolean;
  earlyCheckinTargetIso: string;
}

const path = process.env.SETTINGS_PATH ?? join(process.cwd(), "data", "settings.json");

let cache: AppSettings | null = null;

async function ensureDir() {
  const dir = join(path, "..");
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch {
    /* ignore */
  }
}

export async function loadSettings(): Promise<AppSettings> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(path, "utf8");
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    cache = { ...DEFAULTS, ...parsed };
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache;
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
  await ensureDir();
  const current = await loadSettings();
  const next: AppSettings = { ...current, ...settings };
  await fs.writeFile(path, JSON.stringify(next, null, 2), "utf8");
  cache = next;
  return next;
}
