import { resolve } from "node:path";
import { GlobalFonts } from "@napi-rs/canvas";

// Curated fonts for the poster designer. The SAME .ttf files are used two ways:
//   - server: registered here so composePoster can render them (crisp, deterministic)
//   - browser: served from /poster-fonts/<file> via @font-face so the WYSIWYG editor
//     preview matches the composited output exactly.
// `family` is the canonical name stored in template.json (text.font) and used in both
// the canvas font string and the CSS font-family. Bold-by-nature display faces and an
// explicit Poppins Bold cover headline weight without relying on synthetic bolding.

export interface PosterFont {
  family: string;
  file: string;
  label: string;
}

export const POSTER_FONTS: PosterFont[] = [
  { family: "Noto Sans", file: "NotoSans-Regular.ttf", label: "Noto Sans" },
  { family: "Poppins", file: "Poppins-Regular.ttf", label: "Poppins" },
  { family: "Poppins Bold", file: "Poppins-Bold.ttf", label: "Poppins Bold" },
  { family: "Montserrat", file: "Montserrat-Regular.ttf", label: "Montserrat" },
  { family: "Oswald", file: "Oswald-Regular.ttf", label: "Oswald (Condensed)" },
  { family: "Bebas Neue", file: "BebasNeue-Regular.ttf", label: "Bebas Neue (Tall caps)" },
  { family: "Anton", file: "Anton-Regular.ttf", label: "Anton (Impact)" },
  { family: "Pacifico", file: "Pacifico-Regular.ttf", label: "Pacifico (Script)" },
  { family: "Lobster", file: "Lobster-Regular.ttf", label: "Lobster (Script)" },
  { family: "Playfair Display", file: "PlayfairDisplay-Regular.ttf", label: "Playfair Display (Serif)" },
  { family: "Caveat", file: "Caveat-Regular.ttf", label: "Caveat (Handwritten)" },
  { family: "Righteous", file: "Righteous-Regular.ttf", label: "Righteous" },
];

/** Directory the .ttf files live in (also web-served at /poster-fonts/<file>). */
export const POSTER_FONTS_DIR = resolve(process.cwd(), "public", "poster-fonts");

const FALLBACK_FAMILY = "Noto Sans";

let registered = false;

/** Register every curated font process-wide, exactly once. Safe to call repeatedly. */
export function registerPosterFonts(): void {
  if (registered) return;
  for (const f of POSTER_FONTS) {
    try {
      GlobalFonts.registerFromPath(resolve(POSTER_FONTS_DIR, f.file), f.family);
    } catch {
      /* a missing/invalid file shouldn't break composition — skip it */
    }
  }
  registered = true;
}

/** True if a family is one we ship (used to validate template saves). */
export function isKnownFont(family: string | undefined): boolean {
  if (!family) return true; // undefined -> compositor default
  return family === FALLBACK_FAMILY || POSTER_FONTS.some((f) => f.family === family);
}
