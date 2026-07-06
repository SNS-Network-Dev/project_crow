import { promises as fs } from "fs";
import { join } from "path";

// Lightweight server-side settings store (JSON file). Used for admin toggles
// that don't justify a database table, e.g. the early-check-in countdown timer.

const DEFAULTS: AppSettings = {
  eventName: "Project Crow Event",
  eventStartIso: "2025-07-17T18:00:00+08:00",
  earlyCheckinCountdownEnabled: false,
  // Photo-booth generation controls (see Booth control page). Prompts blank =
  // baremetal house default (no override sent). Variants clamped by the API too.
  avatarKelvinVariants: 4,
  avatarGroupVariants: 3,
  avatarPrompt: "",
  avatarPairPrompt: "",
  avatarGroupPrompt: "",
};

export interface AppSettings {
  eventName: string;
  eventStartIso: string;
  earlyCheckinCountdownEnabled: boolean;
  avatarKelvinVariants: number; // /kelvin poses to choose from, 1–4
  avatarGroupVariants: number; // /group takes, 1–6
  avatarPrompt: string; // /kelvin figurine override ("" = house default)
  avatarPairPrompt: string; // /kelvin guest+Kelvin combine override
  avatarGroupPrompt: string; // /group per-person override
}

// Derived: early check-in opens one hour before the event starts.
export function earlyCheckinTargetIso(settings: AppSettings): string {
  const start = new Date(settings.eventStartIso);
  if (Number.isNaN(start.getTime())) {
    const fallback = new Date();
    fallback.setHours(fallback.getHours() + 1);
    return fallback.toISOString();
  }
  return new Date(start.getTime() - 60 * 60 * 1000).toISOString();
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
