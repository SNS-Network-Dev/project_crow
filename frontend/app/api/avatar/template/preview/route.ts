import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { config } from "@/lib/config";
import { loadTemplate, safeName } from "@/lib/avatarTemplate";
import { composePoster } from "@/lib/avatarComposite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Pixel-perfect preview: composite the CURRENTLY SAVED template with the stand-in
// figure and return the PNG. Lets the designer confirm exactly how a real poster
// will look after saving (the live DOM preview is only an approximation).
export async function GET(request: Request) {
  const name = safeName(new URL(request.url).searchParams.get("name") || "default") || "default";
  try {
    const { tpl, dir } = await loadTemplate(name);
    const figure = await readFile(resolve(config.avatarTemplateDir, "..", "samples", "figure.png"));
    const png = await composePoster(dir, tpl, figure);
    return new Response(new Uint8Array(png), {
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("template preview failed:", e);
    return new Response("Preview failed", { status: 500 });
  }
}
