// Generates PLACEHOLDER avatar-template assets + a stand-in "generated figure",
// then runs a prototype composite so we can eyeball the pipeline before porting
// the logic into lib/avatarComposite.ts. Safe to delete once real artwork lands.
//
//   node scripts/avatar-placeholders.mjs
//
// Writes under <project-root>/data/ (same convention as PHOTO_DIR):
//   data/avatar-templates/default/{template.json,background.png,logos/*.png}
//   data/samples/figure.png   (stand-in for the GPU's transparent full-body PNG)
//   data/samples/out.png      (prototype composite — visual smoke test)

import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";

const ROOT = resolve(process.cwd(), "..");
const TPL_DIR = resolve(ROOT, "data", "avatar-templates", "default");
const SAMPLES = resolve(ROOT, "data", "samples");
const FONT = "Noto Sans"; // a real installed family; swapped for the event font later

const W = 1024;
const H = 1024;

// --- helpers ---------------------------------------------------------------
async function save(path, canvas) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, canvas.toBuffer("image/png"));
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// A crude head-to-feet humanoid silhouette, feet at the bottom of (w,h).
function drawSilhouette(ctx, w, h, fill) {
  ctx.save();
  ctx.fillStyle = fill;
  const cx = w / 2;
  const headR = w * 0.16;
  const headCy = headR + h * 0.04;
  ctx.beginPath();
  ctx.arc(cx, headCy, headR, 0, Math.PI * 2);
  ctx.fill();
  const bodyTop = headCy + headR * 0.7;
  const bodyW = w * 0.5;
  const bodyH = h - bodyTop - h * 0.02;
  roundRect(ctx, cx - bodyW / 2, bodyTop, bodyW, bodyH, w * 0.12);
  ctx.fill();
  ctx.restore();
}

// --- 1) placeholder background (dark starfield + a baked-in "birthday guy") --
function makeBackground() {
  const c = createCanvas(W, H);
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#0b1026");
  g.addColorStop(1, "#161b3a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // stars
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  for (let i = 0; i < 140; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H * 0.55;
    ctx.globalAlpha = 0.3 + Math.random() * 0.6;
    ctx.fillRect(x, y, Math.random() < 0.1 ? 2 : 1, Math.random() < 0.1 ? 2 : 1);
  }
  ctx.globalAlpha = 1;
  // a stage/floor band
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  ctx.fillRect(0, H * 0.86, W, H * 0.14);
  // baked-in RIGHT figure = the fixed "birthday guy" (stays the same every render)
  ctx.save();
  ctx.translate(W * 0.55, H * 0.30);
  drawSilhouette(ctx, W * 0.34, H * 0.60, "#3a4570");
  ctx.restore();
  // a faint empty LEFT slot marker (so we can see where the figure lands)
  ctx.strokeStyle = "rgba(120,200,255,0.18)";
  ctx.setLineDash([8, 8]);
  ctx.strokeRect(150, 300, 360, 620);
  ctx.setLineDash([]);
  return c;
}

// --- 2) placeholder logos --------------------------------------------------
function makeLogo(label, bg, fg, w = 220, h = 56) {
  const c = createCanvas(w, h);
  const ctx = c.getContext("2d");
  ctx.fillStyle = bg;
  roundRect(ctx, 0, 0, w, h, 10);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.font = `bold 22px "${FONT}"`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, w / 2, h / 2 + 1);
  return c;
}

// --- 3) stand-in "generated figure" = GPU output (transparent, 1024x1536) ---
function makeFigure() {
  const fw = 1024;
  const fh = 1536;
  const c = createCanvas(fw, fh);
  const ctx = c.getContext("2d");
  // transparent background on purpose — only the person is drawn
  drawSilhouette(ctx, fw, fh, "#d98a3d"); // warm tone so it's visibly the "new" person
  // a little face so we can tell orientation
  ctx.fillStyle = "#2a2a2a";
  ctx.beginPath();
  ctx.arc(fw / 2 - 40, fh * 0.07, 10, 0, Math.PI * 2);
  ctx.arc(fw / 2 + 40, fh * 0.07, 10, 0, Math.PI * 2);
  ctx.fill();
  return c;
}

// --- 4) prototype composite (mirrors what lib/avatarComposite.ts will do) ---
async function composite(tpl, figureCanvas) {
  const c = createCanvas(tpl.width, tpl.height);
  const ctx = c.getContext("2d");
  const bg = await loadImage(resolve(TPL_DIR, tpl.background));
  ctx.drawImage(bg, 0, 0, tpl.width, tpl.height);

  // place figure: contain within slot, centered horizontally, feet at slot bottom
  const slot = tpl.figure;
  const fr = figureCanvas.width / figureCanvas.height;
  const sr = slot.width / slot.height;
  let dw, dh;
  if (fr > sr) {
    dw = slot.width;
    dh = dw / fr;
  } else {
    dh = slot.height;
    dw = dh * fr;
  }
  const dx = slot.x + (slot.width - dw) / 2;
  const dy = slot.y + (slot.height - dh); // bottom-anchored
  ctx.drawImage(figureCanvas, dx, dy, dw, dh);

  // logos
  for (const lg of tpl.logos) {
    const img = await loadImage(resolve(TPL_DIR, lg.default));
    const ar = img.width / img.height;
    let lw = lg.width ?? img.width;
    let lh = lg.height ?? lw / ar;
    if (lg.width && !lg.height) lh = lw / ar;
    let lx = lg.x;
    if (lg.align === "center") lx = lg.x - lw / 2;
    if (lg.align === "right") lx = lg.x - lw;
    ctx.drawImage(img, lx, lg.y, lw, lh);
  }

  // texts
  for (const t of tpl.texts) {
    let value = t.default;
    if (t.uppercase) value = value.toUpperCase();
    ctx.fillStyle = t.color;
    ctx.textAlign = t.align ?? "left";
    ctx.textBaseline = t.baseline ?? "alphabetic";
    let size = t.size;
    ctx.font = `${t.weight ?? ""} ${size}px "${t.font ?? FONT}"`.trim();
    if (t.maxWidth) {
      while (ctx.measureText(value).width > t.maxWidth && size > 8) {
        size -= 1;
        ctx.font = `${t.weight ?? ""} ${size}px "${t.font ?? FONT}"`.trim();
      }
    }
    ctx.fillText(value, t.x, t.y);
  }
  return c;
}

// --- template config -------------------------------------------------------
const template = {
  name: "default",
  width: W,
  height: H,
  background: "background.png",
  figure: { x: 150, y: 300, width: 360, height: 620, anchor: "bottom" },
  texts: [
    { id: "title", default: "It All Starts Here", x: W / 2, y: 110, size: 60, weight: "bold", color: "#ffffff", align: "center", baseline: "middle", maxWidth: 900 },
    { id: "pioneer", default: "Pioneers No. 3135", x: 980, y: 952, size: 24, weight: "bold", color: "#ffffff", align: "right", baseline: "middle", maxWidth: 360 },
    { id: "with", default: "with Toy Jensen", x: 980, y: 982, size: 18, color: "#b9c2e6", align: "right", baseline: "middle", maxWidth: 360 },
  ],
  logos: [
    { id: "brand", default: "logos/brand.png", x: 44, y: 936, width: 220, align: "left" },
    { id: "powered", default: "logos/powered.png", x: 288, y: 936, width: 200, align: "left" },
  ],
};

// --- run -------------------------------------------------------------------
async function main() {
  const fams = GlobalFonts.families.map((f) => f.family);
  if (!fams.includes(FONT)) console.warn(`[warn] font "${FONT}" not found; using fallback`);

  await save(resolve(TPL_DIR, "background.png"), makeBackground());
  await save(resolve(TPL_DIR, "logos/brand.png"), makeLogo("NVIDIA GTC", "#0a0a0a", "#76b900"));
  await save(resolve(TPL_DIR, "logos/powered.png"), makeLogo("LIVEX.AI", "#16213e", "#7fd1ff", 200, 56));
  await mkdir(TPL_DIR, { recursive: true });
  await writeFile(resolve(TPL_DIR, "template.json"), JSON.stringify(template, null, 2));

  const figure = makeFigure();
  await save(resolve(SAMPLES, "figure.png"), figure);

  const out = await composite(template, figure);
  await save(resolve(SAMPLES, "out.png"), out);

  console.log("OK");
  console.log("template:", resolve(TPL_DIR, "template.json"));
  console.log("figure  :", resolve(SAMPLES, "figure.png"), `${figure.width}x${figure.height}`);
  console.log("out     :", resolve(SAMPLES, "out.png"), `${out.width}x${out.height}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
