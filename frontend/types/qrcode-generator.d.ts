// Minimal ambient types for the zero-dependency `qrcode-generator` (no bundled .d.ts).
// We only use the byte-mode encode + data-URL/SVG render surface.
declare module "qrcode-generator" {
  interface QRCode {
    addData(data: string, mode?: "Byte" | "Numeric" | "Alphanumeric" | "Kanji"): void;
    make(): void;
    getModuleCount(): number;
    isDark(row: number, col: number): boolean;
    /** GIF data URL. cellSize px per module, margin in modules. */
    createDataURL(cellSize?: number, margin?: number): string;
    createSvgTag(opts?: { cellSize?: number; margin?: number; scalable?: boolean }): string;
  }
  type ErrorCorrectionLevel = "L" | "M" | "Q" | "H";
  /** typeNumber 0 = auto-size to fit the data. */
  function qrcode(typeNumber: number, errorCorrectionLevel: ErrorCorrectionLevel): QRCode;
  export default qrcode;
}
