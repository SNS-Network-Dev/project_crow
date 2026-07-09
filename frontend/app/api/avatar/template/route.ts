import { NextResponse } from "next/server";
import { readFile, writeFile, rename, mkdir, stat } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { config } from "@/lib/config";
import { loadTemplate, safeName } from "@/lib/avatarTemplate";
import { sanitizeTemplate, safeRelPath } from "@/lib/avatarTemplateSave";
import { POSTER_FONTS } from "@/lib/posterFonts";
import { BASE_PATH } from "@/lib/basePath";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ASSET_BYTES = 8 * 1024 * 1024; // 8 MB per uploaded image

function templateDir(name: string): string {
  return join(config.avatarTemplateDir, safeName(name) || "default");
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

// GET /api/avatar/template?name=default — the current template plus the curated
// font list and the base URL the editor uses to load background/logo assets.
export async function GET(request: Request) {
  const name = safeName(new URL(request.url).searchParams.get("name") || "default") || "default";
  try {
    const { tpl } = await loadTemplate(name);
    return NextResponse.json({
      name,
      tpl,
      fonts: POSTER_FONTS.map((f) => ({
        family: f.family,
        label: f.label,
        url: `${BASE_PATH}/poster-fonts/${f.file}`,
      })),
      assetBase: `${BASE_PATH}/api/avatar/template/asset?name=${encodeURIComponent(name)}&path=`,
      figureUrl: `${BASE_PATH}/api/avatar/template/asset?sample=figure`,
      previewUrl: `${BASE_PATH}/api/avatar/template/preview?name=${encodeURIComponent(name)}`,
    });
  } catch {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }
}

// POST /api/avatar/template — save an edited template. Multipart body:
//   template : JSON string (the full AvatarTemplate)
//   file:<relpath> : optional image files (new background / logos), stored in the
//                    template dir at <relpath> (path-guarded) before validation.
// Applies immediately: loadTemplate re-reads template.json on the next poster.
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data." }, { status: 400 });
  }

  const name = safeName((form.get("name") ?? "default").toString()) || "default";
  const dir = templateDir(name);
  if (!(await exists(join(dir, "template.json")))) {
    return NextResponse.json({ error: "Unknown template." }, { status: 404 });
  }

  const raw = form.get("template");
  if (typeof raw !== "string") {
    return NextResponse.json({ error: "Missing template JSON." }, { status: 400 });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Template is not valid JSON." }, { status: 400 });
  }

  // 1) Persist uploaded image assets first, so referenced paths exist for validation.
  try {
    for (const [k, v] of form.entries()) {
      if (!k.startsWith("file:") || !(v instanceof Blob)) continue;
      const rel = safeRelPath(k.slice(5));
      if (!rel) {
        return NextResponse.json({ error: `Bad asset path: ${k.slice(5)}` }, { status: 400 });
      }
      if (v.size > MAX_ASSET_BYTES) {
        return NextResponse.json({ error: `Asset too large: ${rel}` }, { status: 413 });
      }
      const dest = resolve(dir, rel);
      if (dest !== dir && !dest.startsWith(dir + "/")) {
        return NextResponse.json({ error: "Asset path escapes template." }, { status: 400 });
      }
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, Buffer.from(await v.arrayBuffer()));
    }
  } catch (e) {
    console.error("template asset write failed:", e);
    return NextResponse.json({ error: "Could not store uploaded image." }, { status: 500 });
  }

  // 2) Sanitize structure, then drop any element whose asset is missing on disk.
  const { tpl: current } = await loadTemplate(name);
  const clean = sanitizeTemplate(parsed, name, current.width, current.height);

  if (!(await exists(resolve(dir, clean.background)))) {
    clean.background = current.background; // keep the working background if the new one is absent
  }
  const logos = [];
  for (const lg of clean.logos) {
    if (await exists(resolve(dir, lg.default))) logos.push(lg);
  }
  clean.logos = logos;

  // 3) Back up the previous template.json, then write the new one atomically.
  try {
    await writeFile(join(dir, "template.prev.json"), JSON.stringify(current, null, 2));
    const tmp = join(dir, `.template.${Date.now()}.tmp`);
    await writeFile(tmp, JSON.stringify(clean, null, 2));
    await rename(tmp, join(dir, "template.json"));
  } catch (e) {
    console.error("template write failed:", e);
    return NextResponse.json({ error: "Could not save template." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, tpl: clean });
}
