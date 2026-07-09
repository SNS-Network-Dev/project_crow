import type { AvatarTemplate, TextField, LogoSlot } from "./avatarTemplate";
import { isKnownFont } from "./posterFonts";

// Structural sanitizer for a template posted by the designer. Never trust the
// client: clamp all geometry, whitelist enums, validate colors, and reject any
// asset path that could escape the template directory. Returns a clean template;
// the route still verifies that referenced asset files actually exist on disk.

const num = (v: unknown, def: number, min: number, max: number): number => {
  const n = typeof v === "number" && Number.isFinite(v) ? v : def;
  return Math.min(max, Math.max(min, n));
};
const str = (v: unknown, max = 300): string => (typeof v === "string" ? v.slice(0, max) : "");
const id = (v: unknown, fallback: string): string => {
  const s = typeof v === "string" ? v.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 40) : "";
  return s || fallback;
};
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], def: T): T =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : def;

// Accept #hex, rgb()/rgba(), or a plain CSS color keyword.
const COLOR_RE = /^#[0-9a-fA-F]{3,8}$|^rgba?\([\d.,\s%]+\)$|^[a-zA-Z]{1,20}$/;
const color = (v: unknown, def: string): string =>
  typeof v === "string" && COLOR_RE.test(v.trim()) ? v.trim() : def;

// A relative path inside the template dir: no leading slash, no "..", safe chars only.
export function safeRelPath(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\\/g, "/").trim();
  if (!s || s.startsWith("/") || s.includes("..") || s.includes("\0")) return null;
  if (!/^[a-zA-Z0-9._/-]+$/.test(s)) return null;
  return s;
}

export function sanitizeTemplate(
  input: unknown,
  name: string,
  fallbackW: number,
  fallbackH: number,
): AvatarTemplate {
  const o = (input ?? {}) as Record<string, unknown>;
  const width = num(o.width, fallbackW, 64, 4096);
  const height = num(o.height, fallbackH, 64, 4096);
  const bound = Math.max(width, height) * 2;

  const bg = safeRelPath(o.background) ?? "bg.png";

  const fig = (o.figure ?? {}) as Record<string, unknown>;
  const figure = {
    x: num(fig.x, 0, -bound, bound),
    y: num(fig.y, 0, -bound, bound),
    width: num(fig.width, width, 1, bound),
    height: num(fig.height, height, 1, bound),
    anchor: oneOf(fig.anchor, ["bottom", "center", "top"] as const, "bottom"),
  };

  const rawTexts = Array.isArray(o.texts) ? o.texts.slice(0, 16) : [];
  const texts: TextField[] = rawTexts.map((t0, i) => {
    const t = (t0 ?? {}) as Record<string, unknown>;
    const out: TextField = {
      id: id(t.id, `text${i}`),
      default: str(t.default, 300),
      x: num(t.x, width / 2, -bound, bound),
      y: num(t.y, height / 2, -bound, bound),
      size: num(t.size, 40, 6, 400),
      color: color(t.color, "#ffffff"),
      align: oneOf(t.align, ["left", "center", "right"] as const, "left"),
      baseline: oneOf(t.baseline, ["top", "middle", "alphabetic", "bottom"] as const, "alphabetic"),
    };
    if (typeof t.font === "string" && isKnownFont(t.font)) out.font = t.font;
    if (t.weight === "bold" || t.weight === "") out.weight = t.weight;
    if (typeof t.maxWidth === "number") out.maxWidth = num(t.maxWidth, width, 1, bound);
    if (t.uppercase === true) out.uppercase = true;
    const sh = t.shadow as Record<string, unknown> | undefined;
    if (sh && typeof sh === "object") {
      out.shadow = {
        color: color(sh.color, "rgba(0,0,0,0.8)"),
        blur: num(sh.blur, 0, 0, 100),
        x: num(sh.x, 0, -100, 100),
        y: num(sh.y, 0, -100, 100),
      };
    }
    const st = t.stroke as Record<string, unknown> | undefined;
    if (st && typeof st === "object") {
      out.stroke = { color: color(st.color, "rgba(0,0,0,0.6)"), width: num(st.width, 0, 0, 40) };
    }
    return out;
  });

  const rawLogos = Array.isArray(o.logos) ? o.logos.slice(0, 16) : [];
  const logos: LogoSlot[] = [];
  rawLogos.forEach((l0, i) => {
    const l = (l0 ?? {}) as Record<string, unknown>;
    const def = safeRelPath(l.default);
    if (!def) return; // a logo without a valid asset path is dropped
    const out: LogoSlot = {
      id: id(l.id, `logo${i}`),
      default: def,
      x: num(l.x, 0, -bound, bound),
      y: num(l.y, 0, -bound, bound),
      align: oneOf(l.align, ["left", "center", "right"] as const, "left"),
    };
    if (typeof l.width === "number") out.width = num(l.width, 100, 1, bound);
    if (typeof l.height === "number") out.height = num(l.height, 100, 1, bound);
    logos.push(out);
  });

  return { name, width, height, background: bg, figure, texts, logos };
}
