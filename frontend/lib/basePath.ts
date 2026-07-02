// The app is served under a subpath behind Apache (e.g. /project_crow on
// aimy.com.my). Next's `basePath` auto-prefixes <Link>/router/static assets, but
// NOT raw fetch() calls or server-built URLs (like photo_url) — so we prefix those
// with this. Inlined at build time from NEXT_PUBLIC_BASE_PATH (set in .env.local).
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Prefix an absolute app path (e.g. "/api/checkin") with the base path. */
export function withBase(path: string): string {
  return `${BASE_PATH}${path}`;
}
