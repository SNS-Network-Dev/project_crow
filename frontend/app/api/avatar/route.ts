import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { generateKelvin, generateGroup, BMAvatarError, type AvatarImage } from "@/lib/baremetal";
import { loadTemplate } from "@/lib/avatarTemplate";
import { composePoster } from "@/lib/avatarComposite";
import { savePoster } from "@/lib/posters";
import { appendSet } from "@/lib/gallery";
import { loadSettings } from "@/lib/settings";
import { config } from "@/lib/config";
import { BASE_PATH } from "@/lib/basePath";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// AVATAR_FAKE skips the GPU call and uses the placeholder pair (data/samples/figure.png)
// so the capture -> composite -> poster(s) flow is testable without the GPU. Set to 0 live.
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
    return NextResponse.json({ error: "A photo is required." }, { status: 400 });
  }

  const templateName = (form.get("template") ?? "default").toString();
  const mode = (form.get("mode") ?? "kelvin").toString() === "group" ? "group" : "kelvin";

  // Variants + prompt overrides are operator-controlled (Booth control page →
  // settings.json), read fresh per request so changes apply on the next capture
  // with no restart. The booth no longer dictates variants.
  const settings = await loadSettings();

  // Per-request customizable copy: any field named `text:<id>` overrides that template text.
  const textOverrides: Record<string, string> = {};
  for (const [k, v] of form.entries()) {
    if (k.startsWith("text:") && typeof v === "string") textOverrides[k.slice(5)] = v;
  }

  // 1) Generate figure image(s) — one per pose for the kelvin chooser, several for group.
  let results: AvatarImage[];
  try {
    if (FAKE) {
      const ph = await readFile(resolve(config.avatarTemplateDir, "..", "samples", "figure.png"));
      const n = mode === "group" ? settings.avatarGroupVariants : settings.avatarKelvinVariants;
      results = Array.from({ length: n }, (_, i) => ({
        image: ph,
        variant: mode === "group" ? "group" : i === 0 ? "arm-around" : "pose-follow",
        seed: 1000 + i,
      }));
    } else if (mode === "group") {
      results = await generateGroup(photo, {
        variants: settings.avatarGroupVariants,
        prompt: settings.avatarGroupPrompt || undefined,
      });
    } else {
      results = await generateKelvin(photo, {
        variants: settings.avatarKelvinVariants,
        prompt: settings.avatarPrompt || undefined,
        pairPrompt: settings.avatarPairPrompt || undefined,
      });
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

  // 2) Composite each figure onto the fixed event template + persist, then record
  //    the finished set on the live wall (the gallery station polls for it; the
  //    capture station itself only needs the ok/count to reset for the next guest).
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
    const set = await appendSet(
      mode,
      posters.map((p) => ({ id: p.id, variant: p.variant, seed: p.seed })),
    );
    return NextResponse.json({ ok: true, setId: set.id, count: posters.length, posters });
  } catch (e) {
    console.error("avatar composite failed:", e);
    return NextResponse.json({ error: "Could not build the poster." }, { status: 500 });
  }
}
