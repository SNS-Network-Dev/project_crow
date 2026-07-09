import { promises as fs } from "fs";
import { join } from "path";

// Lightweight server-side settings store (JSON file). Used for admin toggles
// that don't justify a database table, e.g. the early-check-in countdown timer.

const DEFAULTS: AppSettings = {
  eventName: "Kelvin Pah's Birthday",
  eventStartIso: "2025-07-17T18:00:00+08:00",
  earlyCheckinCountdownEnabled: false,
  earlyCheckinHoursBefore: 1,
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
  earlyCheckinHoursBefore: number; // self check-in opens this many hours early
  avatarKelvinVariants: number; // /kelvin poses to choose from, 1–4
  avatarGroupVariants: number; // /group takes, 1–6
  avatarPrompt: string; // /kelvin figurine override ("" = house default)
  avatarPairPrompt: string; // /kelvin guest+Kelvin combine override
  avatarGroupPrompt: string; // /group per-person override
}

// Derived: early check-in opens `earlyCheckinHoursBefore` hours before the event.
export function earlyCheckinTargetIso(settings: AppSettings): string {
  const hours = Number.isFinite(settings.earlyCheckinHoursBefore)
    ? Math.max(0, settings.earlyCheckinHoursBefore)
    : 1;
  const start = new Date(settings.eventStartIso);
  if (Number.isNaN(start.getTime())) {
    const fallback = new Date();
    fallback.setHours(fallback.getHours() + hours);
    return fallback.toISOString();
  }
  return new Date(start.getTime() - hours * 60 * 60 * 1000).toISOString();
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
