import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { GlobalFonts } from "@napi-rs/canvas";
import { config } from "./config";

// A poster template = a fixed background (with the birthday-guy figure already baked
// in) + the geometry for the ONE generated figure slot + the customizable text and
// logo overlays. Templates live on the bridge filesystem (config.avatarTemplateDir),
// one subdirectory per template, each with a template.json plus its image assets.

export interface FigureSlot {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Vertical placement of the figure within the slot. Default "bottom" (feet at slot bottom). */
  anchor?: "bottom" | "center" | "top";
}

/** Drop shadow behind text — keeps copy legible over a busy photo background. */
export interface TextShadow {
  color: string;
  blur?: number;
  x?: number;
  y?: number;
}

/** Outline stroke drawn under the fill — extra legibility on bright backgrounds. */
export interface TextStroke {
  color: string;
  width: number;
}

export interface TextField {
  id: string;
  /** Default copy, shown unless the request overrides it by id. */
  default: string;
  x: number;
  y: number;
  size: number;
  color: string;
  /** Registered family name; falls back to the bundled default if absent. */
  font?: string;
  /** e.g. "bold" — prepended to the canvas font string. */
  weight?: string;
  align?: "left" | "center" | "right";
  baseline?: "top" | "middle" | "alphabetic" | "bottom";
  /** If set, the size auto-shrinks until the text fits this width. */
  maxWidth?: number;
  uppercase?: boolean;
  shadow?: TextShadow;
  stroke?: TextStroke;
}

export interface LogoSlot {
  id: string;
  /** Path (relative to the template dir) to the default logo PNG. */
  default: string;
  x: number;
  y: number;
  /** Box to fit the logo into, preserving aspect ratio. */
  width?: number;
  height?: number;
  /** Horizontal anchor of (x): "left" (default), "center", or "right". */
  align?: "left" | "center" | "right";
}

export interface FontDef {
  family: string;
  /** Path (relative to the template dir) to a .ttf/.otf to register under `family`. */
  path: string;
}

export interface AvatarTemplate {
  name: string;
  width: number;
  height: number;
  /** Path (relative to the template dir) to the background PNG. */
  background: string;
  figure: FigureSlot;
  fonts?: FontDef[];
  texts: TextField[];
  logos: LogoSlot[];
}

export interface LoadedTemplate {
  tpl: AvatarTemplate;
  /** Absolute directory the template's assets resolve against. */
  dir: string;
}

// Prevent path traversal: a template name maps to exactly one safe subdir.
export function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "");
}

// Fonts register process-wide; only register each file once.
const registeredFonts = new Set<string>();

export async function loadTemplate(name = "default"): Promise<LoadedTemplate> {
  const dir = join(config.avatarTemplateDir, safeName(name) || "default");
  const raw = await readFile(join(dir, "template.json"), "utf8");
  const tpl = JSON.parse(raw) as AvatarTemplate;

  for (const f of tpl.fonts ?? []) {
    const p = resolve(dir, f.path);
    if (!registeredFonts.has(p)) {
      GlobalFonts.registerFromPath(p, f.family);
      registeredFonts.add(p);
    }
  }

  return { tpl, dir };
}
