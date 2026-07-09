import { readFile } from "node:fs/promises";
import { join, resolve, extname } from "node:path";
import { config } from "@/lib/config";
import { safeName } from "@/lib/avatarTemplate";
import { safeRelPath } from "@/lib/avatarTemplateSave";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Serve a template's background/logo image (or the stand-in figure) for the
// designer preview. Template assets live on the bridge filesystem, not public/,
// so they're read here — operator-gated by proxy (/api/avatar/*).
const TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function send(buf: Buffer, type: string): Response {
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": type, "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);

  // Stand-in figure that occupies the figure slot in the editor stage.
  if (url.searchParams.get("sample") === "figure") {
    try {
      const p = resolve(config.avatarTemplateDir, "..", "samples", "figure.png");
      return send(await readFile(p), "image/png");
    } catch {
      return new Response("Not found", { status: 404 });
    }
  }

  const name = safeName(url.searchParams.get("name") || "default") || "default";
  const rel = safeRelPath(url.searchParams.get("path"));
  if (!rel) return new Response("Bad path", { status: 400 });

  const dir = join(config.avatarTemplateDir, name);
  const file = resolve(dir, rel);
  if (file !== dir && !file.startsWith(dir + "/")) {
    return new Response("Forbidden", { status: 403 });
  }
  try {
    const buf = await readFile(file);
    return send(buf, TYPES[extname(file).toLowerCase()] ?? "application/octet-stream");
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
