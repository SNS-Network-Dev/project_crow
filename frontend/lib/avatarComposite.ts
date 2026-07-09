import { resolve } from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import type { AvatarTemplate } from "./avatarTemplate";
import { registerPosterFonts } from "./posterFonts";

// Deterministic poster compositor. Draws, in order:
//   1. the fixed background (already contains the birthday-guy figure),
//   2. the ONE generated figure, contained in its slot (centered, bottom-anchored),
//   3. the logos (default or per-request override),
//   4. the customizable text (default or per-request override).
// Text + logos are rendered here — never by the image model — so they stay crisp,
// swappable, and pixel-identical run to run. Mirrors scripts/avatar-placeholders.mjs.

const DEFAULT_FONT = "Noto Sans";

export interface PosterOverrides {
  /** text field id -> replacement value */
  texts?: Record<string, string>;
  /** logo slot id -> replacement PNG bytes */
  logos?: Record<string, Buffer>;
}

export async function composePoster(
  dir: string,
  tpl: AvatarTemplate,
  figure: Buffer,
  overrides: PosterOverrides = {},
): Promise<Buffer> {
  registerPosterFonts(); // curated designer fonts (no-op after first call)
  const canvas = createCanvas(tpl.width, tpl.height);
  const ctx = canvas.getContext("2d");

  // 1) background
  const bg = await loadImage(resolve(dir, tpl.background));
  ctx.drawImage(bg, 0, 0, tpl.width, tpl.height);

  // 2) figure: contain within the slot (preserve aspect), center horizontally, anchor
  const fig = await loadImage(figure);
  const slot = tpl.figure;
  const figRatio = fig.width / fig.height;
  const slotRatio = slot.width / slot.height;
  let dw: number;
  let dh: number;
  if (figRatio > slotRatio) {
    dw = slot.width;
    dh = dw / figRatio;
  } else {
    dh = slot.height;
    dw = dh * figRatio;
  }
  const dx = slot.x + (slot.width - dw) / 2;
  const anchor = slot.anchor ?? "bottom";
  const dy =
    anchor === "top"
      ? slot.y
      : anchor === "center"
        ? slot.y + (slot.height - dh) / 2
        : slot.y + (slot.height - dh); // bottom
  ctx.drawImage(fig, dx, dy, dw, dh);

  // 3) logos
  for (const lg of tpl.logos) {
    const custom = overrides.logos?.[lg.id];
    const img = await loadImage(custom ?? resolve(dir, lg.default));
    const ar = img.width / img.height;
    const lw = lg.width ?? img.width;
    const lh = lg.height ?? lw / ar;
    let lx = lg.x;
    if (lg.align === "center") lx -= lw / 2;
    else if (lg.align === "right") lx -= lw;
    ctx.drawImage(img, lx, lg.y, lw, lh);
  }

  // 4) texts
  const clearShadow = () => {
    ctx.shadowColor = "rgba(0,0,0,0)";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  };
  for (const t of tpl.texts) {
    let value = overrides.texts?.[t.id] ?? t.default;
    if (!value) continue;
    if (t.uppercase) value = value.toUpperCase();
    const family = t.font ?? DEFAULT_FONT;
    ctx.textAlign = t.align ?? "left";
    ctx.textBaseline = t.baseline ?? "alphabetic";
    let size = t.size;
    const applyFont = () => {
      ctx.font = `${t.weight ?? ""} ${size}px "${family}"`.trim();
    };
    applyFont();
    if (t.maxWidth) {
      while (size > 8 && ctx.measureText(value).width > t.maxWidth) {
        size -= 1;
        applyFont();
      }
    }
    // Shadow applies to the first paint only (stroke if present, else fill) so the
    // outline + fill don't stack into a heavy double shadow.
    if (t.shadow) {
      ctx.shadowColor = t.shadow.color;
      ctx.shadowBlur = t.shadow.blur ?? 0;
      ctx.shadowOffsetX = t.shadow.x ?? 0;
      ctx.shadowOffsetY = t.shadow.y ?? 0;
    }
    if (t.stroke) {
      ctx.lineWidth = t.stroke.width;
      ctx.strokeStyle = t.stroke.color;
      ctx.lineJoin = "round";
      ctx.strokeText(value, t.x, t.y);
      clearShadow();
    }
    ctx.fillStyle = t.color;
    ctx.fillText(value, t.x, t.y);
    clearShadow();
  }

  return canvas.toBuffer("image/png");
}
