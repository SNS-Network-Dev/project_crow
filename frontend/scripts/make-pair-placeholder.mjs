// Generates a PLACEHOLDER two-person "pair" PNG that mimics what the GPU will return
// once it generates the guest + Kelvin together (see avatar-gen-contract.md): a
// transparent 1280x1024 canvas with two full-body figures posed side-by-side, feet near
// the bottom, centered. Used only for AVATAR_FAKE-mode layout testing before the GPU
// pair endpoint ships. Writes to data/samples/figure.png (the FAKE placeholder path).
//
//   node scripts/make-pair-placeholder.mjs

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";

const ROOT = resolve(process.cwd(), "..");
const KELVIN = resolve(ROOT, "data", "avatar-templates", "default", "mr_kelvin_2.png");
const OUT = resolve(ROOT, "data", "samples", "figure.png");

const W = 1280;
const H = 1024;

// mr_kelvin_2 person bbox within its 230x716 canvas (measured): x 31..203, y 198..633.
const SRC_W = 230;
const PERSON = { top: 198, bottom: 633, cx: 117 }; // in source px

async function main() {
  const kelvin = await loadImage(KELVIN);
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Scale so each person is ~820px tall; feet ~40px above the canvas bottom.
  const personSrcH = PERSON.bottom - PERSON.top; // 435
  const targetPersonH = 820;
  const s = targetPersonH / personSrcH;
  const drawW = kelvin.width * s;
  const drawH = kelvin.height * s;
  const feetY = H - 40;
  const yOff = feetY - PERSON.bottom * s; // places scaled feet at feetY
  const personCxScaled = PERSON.cx * s;

  // Two figures, shoulder-to-shoulder near center.
  for (const centerX of [470, 810]) {
    ctx.drawImage(kelvin, centerX - personCxScaled, yOff, drawW, drawH);
  }

  await writeFile(OUT, canvas.toBuffer("image/png"));
  console.log("wrote", OUT, `${W}x${H}`, "person~" + targetPersonH + "px, feet@" + feetY);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
