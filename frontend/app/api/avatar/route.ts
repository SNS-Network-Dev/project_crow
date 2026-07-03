import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { generateKelvin, generateGroup, BMAvatarError, type AvatarImage } from "@/lib/baremetal";
import { loadTemplate } from "@/lib/avatarTemplate";
import { composePoster } from "@/lib/avatarComposite";
import { savePoster } from "@/lib/posters";
import { config } from "@/lib/config";
import { BASE_PATH } from "@/lib/basePath";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// AVATAR_FAKE skips the GPU call and uses the placeholder pair (data/samples/figure.png)
// so the capture -> composite -> poster(s) flow is testable without the GPU. Set to 0 live.
const FAKE = ["1", "true", "yes"].includes((process.env.AVATAR_FAKE ?? "").toLowerCase());
const TRUTHY = new Set(["1", "true", "yes", "on"]);

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data." }, { status: 400 });
  }

  const photo = form.get("photo");
  if (!(photo instanceof Blob) || photo.size === 0) {
    return NextResponse.json({ error: "A photo is required." }, { status: 400 });
  }

  const templateName = (form.get("template") ?? "default").toString();
  const mode = (form.get("mode") ?? "kelvin").toString() === "group" ? "group" : "kelvin";
  const withKelvin = TRUTHY.has((form.get("kelvin") ?? "").toString().toLowerCase());
  const variants = Math.min(4, Math.max(1, parseInt((form.get("variants") ?? "1").toString(), 10) || 1));

  // Per-request customizable copy: any field named `text:<id>` overrides that template text.
  const textOverrides: Record<string, string> = {};
  for (const [k, v] of form.entries()) {
    if (k.startsWith("text:") && typeof v === "string") textOverrides[k.slice(5)] = v;
  }

  // 1) Generate figure image(s) — one per pose for the kelvin chooser, one for group.
  let results: AvatarImage[];
  try {
    if (FAKE) {
      const ph = await readFile(resolve(config.avatarTemplateDir, "..", "samples", "figure.png"));
      const n = mode === "group" ? 1 : variants;
      results = Array.from({ length: n }, (_, i) => ({
        image: ph,
        variant: mode === "group" ? undefined : i === 0 ? "arm-around" : "pose-follow",
        seed: 1000 + i,
      }));
    } else if (mode === "group") {
      results = await generateGroup(photo, { kelvin: withKelvin });
    } else {
      results = await generateKelvin(photo, { variants });
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

  // 2) Composite each figure onto the fixed event template + persist.
  try {
    const { tpl, dir } = await loadTemplate(templateName);
    const posters = [];
    for (const r of results) {
      const png = await composePoster(dir, tpl, r.image, { texts: textOverrides });
      const id = randomUUID();
      await savePoster(id, png);
      posters.push({
        id,
        url: `${BASE_PATH}/api/posters/${id}`,
        variant: r.variant ?? null,
        seed: r.seed ?? null,
      });
    }
    return NextResponse.json({ posters });
  } catch (e) {
    console.error("avatar composite failed:", e);
    return NextResponse.json({ error: "Could not build the poster." }, { status: 500 });
  }
}
