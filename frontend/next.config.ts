import type { NextConfig } from "next";

// Served under a subpath behind Apache (e.g. /project_crow on aimy.com.my).
// basePath must match NEXT_PUBLIC_BASE_PATH (set in .env.local) so routes, assets,
// and the lib/basePath helper all agree. Empty = served at root (local dev).
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  ...(basePath ? { basePath } : {}),
  // @napi-rs/canvas ships a native .node addon (used by the avatar compositor in
  // route handlers). Opt it out of server bundling so it's loaded via native require.
  serverExternalPackages: ["@napi-rs/canvas"],
};

export default nextConfig;
