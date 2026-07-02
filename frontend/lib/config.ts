import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// DB credentials live in the PROJECT-ROOT .env (one level above this Next app),
// which the user manages ("i already paste the credentials at .env file").
//
// We deliberately do NOT use dotenv here: the real DB password contains a '#'
// (e.g. "-%1Xb#imDmDJ"), and dotenv treats an unquoted '#' as the start of an
// inline comment and truncates the value -> ACCESS_DENIED. bash and the mysql
// CLI handle it fine, so the .env is correct as-is; we just parse it tolerantly:
// everything after the first '=' on a line is the value, verbatim (quotes
// stripped only if the whole value is wrapped). Bridge-specific runtime config
// (BAREMETAL_*, PHOTO_DIR) lives in frontend/.env.local, auto-loaded by Next.

function parseEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return out;
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\r$/, "");
    if (!line || /^\s*#/.test(line)) continue; // blank or full-line comment
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1);
    // Strip surrounding quotes only if the entire value is wrapped.
    if (value.length >= 2 && ((value[0] === '"' && value.at(-1) === '"') || (value[0] === "'" && value.at(-1) === "'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const rootEnv = parseEnvFile(resolve(process.cwd(), "..", ".env"));

function required(name: string): string {
  // File is authoritative for DB creds; fall back to process.env for deploys
  // that inject vars instead of using the root .env file.
  const v = rootEnv[name] ?? process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name} (set it in the project-root .env)`);
  return v;
}

export const config = {
  db: {
    host: required("DB_HOST"),
    port: Number(rootEnv.DB_PORT ?? process.env.DB_PORT ?? 3306),
    user: required("DB_USER"),
    password: required("DB_PASS"),
    database: required("DB_NAME"),
  },
  // The baremetal face-compute service. Only this bridge talks to it. See
  // baremetal-contract.md. URL + shared token come from frontend/.env.local.
  baremetal: {
    url: (process.env.BAREMETAL_URL ?? "http://127.0.0.1:8000").replace(/\/$/, ""),
    token: process.env.BAREMETAL_TOKEN ?? "",
  },
  // Where registration JPEGs are stored on the bridge filesystem (served as
  // confirm-screen thumbnails). Defaults to <project-root>/data/photos.
  photoDir: process.env.PHOTO_DIR ?? resolve(process.cwd(), "..", "data", "photos"),
  // Avatar-poster feature. Fixed templates (background + birthday-guy + slot/text/logo
  // config) live under avatarTemplateDir, one subdir per template; generated posters
  // are written to postersDir. Both default under <project-root>/data, like photos.
  avatarTemplateDir:
    process.env.AVATAR_TEMPLATE_DIR ?? resolve(process.cwd(), "..", "data", "avatar-templates"),
  postersDir: process.env.POSTERS_DIR ?? resolve(process.cwd(), "..", "data", "posters"),
} as const;
