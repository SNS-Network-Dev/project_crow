import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { generateAvatar, BMAvatarError } from "@/lib/baremetal";
import { loadTemplate } from "@/lib/avatarTemplate";
import { composePoster } from "@/lib/avatarComposite";
import { savePoster } from "@/lib/posters";
import { config } from "@/lib/config";
import { BASE_PATH } from "@/lib/basePath";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// AVATAR_FAKE skips the GPU call and uses the placeholder figure
// (data/samples/figure.png) so the capture -> composite -> poster flow is testable
// before the GPU /avatar/generate endpoint exists. Remove once that endpoint is live.
const FAKE = ["1", "true", "yes"].includes((process.env.AVATAR_FAKE ?? "").toLowerCase());

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data." }, { status: 400 });
  }

  const photo = form.get("photo");
  if (!(photo instanceof Blob) || photo.size === 0) {
    return NextResponse.json({ error: "A full-body photo is required." }, { status: 400 });
  }

  const templateName = (form.get("template") ?? "default").toString();

  // Per-request customizable copy: any form field named `text:<id>` overrides that
  // text field's default in the template (e.g. text:title, text:pioneer).
  const textOverrides: Record<string, string> = {};
  for (const [k, v] of form.entries()) {
    if (k.startsWith("text:") && typeof v === "string") textOverrides[k.slice(5)] = v;
  }

  // 1) Stylized figure from the GPU (or placeholder in FAKE mode).
  let figure: Buffer;
  try {
    if (FAKE) {
      figure = await readFile(resolve(config.avatarTemplateDir, "..", "samples", "figure.png"));
    } else {
      figure = await generateAvatar(photo);
    }
  } catch (e) {
    if (e instanceof BMAvatarError) {
      return NextResponse.json({ error: e.message }, { status: 422 });
    }
    return NextResponse.json(
      { error: "Avatar generator unavailable. Try again shortly." },
      { status: 503 },
    );
  }

  // 2) Composite onto the fixed event template.
  let png: Buffer;
  try {
    const { tpl, dir } = await loadTemplate(templateName);
    png = await composePoster(dir, tpl, figure, { texts: textOverrides });
  } catch (e) {
    console.error("avatar composite failed:", e);
    return NextResponse.json({ error: "Could not build the poster." }, { status: 500 });
  }

  // 3) Persist and hand back a URL the browser can render/download.
  const id = randomUUID();
  await savePoster(id, png);
  return NextResponse.json({ id, url: `${BASE_PATH}/api/posters/${id}` });
}
