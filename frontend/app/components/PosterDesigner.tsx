"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { BASE_PATH } from "@/lib/basePath";
import { useToast } from "./ToastProvider";

// Poster template designer. Renders the real background + a stand-in figure at
// scale, with the template's text/logos as draggable elements. Edits update a
// client copy of template.json; Save posts it (+ any uploaded images) back. The
// on-canvas stage is a LAYOUT preview (CSS approximates canvas text); the
// "Preview real poster" button renders the exact server composite.

interface Shadow { color: string; blur?: number; x?: number; y?: number }
interface Stroke { color: string; width: number }
interface TextField {
  id: string; default: string; x: number; y: number; size: number; color: string;
  font?: string; weight?: string; align?: "left" | "center" | "right";
  baseline?: "top" | "middle" | "alphabetic" | "bottom";
  maxWidth?: number; uppercase?: boolean; shadow?: Shadow; stroke?: Stroke;
}
interface LogoSlot {
  id: string; default: string; x: number; y: number;
  width?: number; height?: number; align?: "left" | "center" | "right";
}
interface FigureSlot { x: number; y: number; width: number; height: number; anchor?: "bottom" | "center" | "top" }
interface Template {
  name: string; width: number; height: number; background: string;
  figure: FigureSlot; texts: TextField[]; logos: LogoSlot[];
}
interface FontDef { family: string; label: string; url: string }
type Selection = { kind: "text" | "logo"; index: number } | null;

const DEFAULT_SHADOW: Shadow = { color: "rgba(0,0,0,0.8)", blur: 12, x: 0, y: 3 };
const DEFAULT_STROKE: Stroke = { color: "rgba(0,0,0,0.55)", width: 6 };

export default function PosterDesigner() {
  const toast = useToast();
  const [tpl, setTpl] = useState<Template | null>(null);
  const [fonts, setFonts] = useState<FontDef[]>([]);
  const [assetBase, setAssetBase] = useState("");
  const [figureUrl, setFigureUrl] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [sel, setSel] = useState<Selection>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState<string | null>(null);
  const [figAspect, setFigAspect] = useState(1);

  // Uploaded-but-unsaved assets: relPath -> File (posted on save) and -> objectURL (preview).
  const filesRef = useRef<Map<string, File>>(new Map());
  const [assetUrls, setAssetUrls] = useState<Map<string, string>>(new Map());
  const [bgVersion, setBgVersion] = useState(0); // cache-bust the background after save

  // Stage sizing.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [stageW, setStageW] = useState(900);
  const scale = tpl ? stageW / tpl.width : 1;
  const scaleRef = useRef(scale);
  useEffect(() => { scaleRef.current = scale; }, [scale]);

  const markDirty = useCallback(() => setDirty(true), []);

  // ---- load template ----
  useEffect(() => {
    fetch(`${BASE_PATH}/api/avatar/template?name=default`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { toast.show(d.error, "error"); return; }
        setTpl(d.tpl);
        setFonts(d.fonts ?? []);
        setAssetBase(d.assetBase ?? "");
        setFigureUrl(`${d.figureUrl}`);
        setPreviewUrl(d.previewUrl ?? "");
      })
      .catch(() => toast.show("Could not load the template.", "error"));
  }, [toast]);

  // ---- @font-face for the curated fonts, so the stage matches the poster ----
  const fontCss = useMemo(
    () =>
      fonts
        .map((f) => `@font-face{font-family:"${f.family}";src:url("${f.url}");font-display:swap;}`)
        .join("\n"),
    [fonts],
  );

  // ---- stage width tracking ----
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setStageW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tpl]);

  // figure aspect from the stand-in image
  useEffect(() => {
    if (!figureUrl) return;
    const img = new Image();
    img.onload = () => setFigAspect(img.naturalWidth / img.naturalHeight || 1);
    img.src = figureUrl;
  }, [figureUrl]);

  const assetSrc = useCallback(
    (relPath: string) => {
      const local = assetUrls.get(relPath);
      if (local) return local;
      return `${assetBase}${encodeURIComponent(relPath)}&v=${bgVersion}`;
    },
    [assetUrls, assetBase, bgVersion],
  );

  // ---- immutable updates ----
  const patchText = useCallback((i: number, patch: Partial<TextField>) => {
    setTpl((t) => (t ? { ...t, texts: t.texts.map((x, j) => (j === i ? { ...x, ...patch } : x)) } : t));
    markDirty();
  }, [markDirty]);
  const patchLogo = useCallback((i: number, patch: Partial<LogoSlot>) => {
    setTpl((t) => (t ? { ...t, logos: t.logos.map((x, j) => (j === i ? { ...x, ...patch } : x)) } : t));
    markDirty();
  }, [markDirty]);

  // ---- drag / resize ----
  const onElementPointerDown = useCallback(
    (e: React.PointerEvent, kind: "text" | "logo", index: number, mode: "move" | "resize") => {
      e.preventDefault();
      e.stopPropagation();
      setSel({ kind, index });
      const startX = e.clientX;
      const startY = e.clientY;
      const t = tpl;
      if (!t) return;
      const el = kind === "text" ? t.texts[index] : t.logos[index];
      const origX = el.x;
      const origY = el.y;
      const origW = kind === "logo" ? (t.logos[index].width ?? 200) : 0;

      const move = (ev: PointerEvent) => {
        const s = scaleRef.current || 1;
        const dx = (ev.clientX - startX) / s;
        const dy = (ev.clientY - startY) / s;
        if (mode === "resize" && kind === "logo") {
          patchLogo(index, { width: Math.max(12, Math.round(origW + dx)) });
        } else if (kind === "text") {
          patchText(index, { x: Math.round(origX + dx), y: Math.round(origY + dy) });
        } else {
          patchLogo(index, { x: Math.round(origX + dx), y: Math.round(origY + dy) });
        }
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [tpl, patchText, patchLogo],
  );

  // ---- toolbar actions ----
  const addText = useCallback(() => {
    setTpl((t) => {
      if (!t) return t;
      const nt: TextField = {
        id: `text${Date.now()}`, default: "New text",
        x: Math.round(t.width / 2), y: Math.round(t.height / 2),
        size: 48, color: "#ffffff", align: "center", baseline: "middle",
        font: "Poppins Bold", shadow: { ...DEFAULT_SHADOW },
      };
      return { ...t, texts: [...t.texts, nt] };
    });
    setTimeout(() => setSel({ kind: "text", index: (tpl?.texts.length ?? 0) }), 0);
    markDirty();
  }, [tpl, markDirty]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  const stageImage = useCallback((file: File, relPath: string) => {
    filesRef.current.set(relPath, file);
    const url = URL.createObjectURL(file);
    setAssetUrls((m) => { const n = new Map(m); n.set(relPath, url); return n; });
    return url;
  }, []);

  const onAddImage = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !tpl) return;
    const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
    const rel = `logos/upload-${Date.now()}.${ext}`;
    stageImage(file, rel);
    setTpl((t) => t ? { ...t, logos: [...t.logos, { id: `logo${Date.now()}`, default: rel, x: Math.round(t.width / 2), y: Math.round(t.height - 160), width: 200, align: "center" }] } : t);
    setTimeout(() => setSel({ kind: "logo", index: (tpl.logos.length) }), 0);
    markDirty();
  }, [tpl, stageImage, markDirty]);

  const onReplaceImage = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !tpl || sel?.kind !== "logo") return;
    const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
    const rel = `logos/upload-${Date.now()}.${ext}`;
    stageImage(file, rel);
    patchLogo(sel.index, { default: rel });
  }, [tpl, sel, stageImage, patchLogo]);

  const onSwapBackground = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !tpl) return;
    const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
    const rel = `bg-upload-${Date.now()}.${ext}`;
    stageImage(file, rel);
    // Set the reference synchronously so a quick Save always persists it. The
    // canvas keeps its fixed size (the compositor scales any background to fill
    // tpl.width × tpl.height), so element positions are preserved.
    setTpl((t) => (t ? { ...t, background: rel } : t));
    markDirty();
    toast.show("Background swapped. Save to apply it to new posters.", "info");
  }, [tpl, stageImage, markDirty, toast]);

  const deleteSelected = useCallback(() => {
    if (!sel || !tpl) return;
    if (sel.kind === "text") {
      setTpl((t) => t ? { ...t, texts: t.texts.filter((_, j) => j !== sel.index) } : t);
    } else {
      setTpl((t) => t ? { ...t, logos: t.logos.filter((_, j) => j !== sel.index) } : t);
    }
    setSel(null);
    markDirty();
  }, [sel, tpl, markDirty]);

  const reset = useCallback(() => {
    if (dirty && !window.confirm("Discard unsaved changes and reload the saved template?")) return;
    filesRef.current.clear();
    setAssetUrls(new Map());
    setSel(null);
    setDirty(false);
    fetch(`${BASE_PATH}/api/avatar/template?name=default`, { cache: "no-store" })
      .then((r) => r.json()).then((d) => { if (d.tpl) setTpl(d.tpl); });
  }, [dirty]);

  const save = useCallback(async () => {
    if (!tpl || saving) return;
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("name", tpl.name || "default");
      fd.append("template", JSON.stringify(tpl));
      for (const [rel, file] of filesRef.current.entries()) fd.append(`file:${rel}`, file, file.name);
      const res = await fetch(`${BASE_PATH}/api/avatar/template`, { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { toast.show(body.error ?? "Save failed.", "error"); return; }
      filesRef.current.clear();
      setAssetUrls(new Map());
      setTpl(body.tpl);
      setDirty(false);
      setBgVersion((v) => v + 1);
      toast.show("Poster template saved. New posters use it immediately.", "ok");
    } catch {
      toast.show("Network error saving template.", "error");
    } finally {
      setSaving(false);
    }
  }, [tpl, saving, toast]);

  const openRealPreview = useCallback(async () => {
    if (dirty) { toast.show("Save first to preview the exact poster.", "info"); return; }
    setPreviewOpen(`${previewUrl}&t=${Date.now()}`);
  }, [dirty, previewUrl, toast]);

  if (!tpl) {
    return <main className="wrap wrap--wide"><p className="subtitle">Loading poster template…</p></main>;
  }

  // figure stand-in placement (mirrors the compositor: contain, center-x, bottom)
  const slot = tpl.figure;
  const slotRatio = slot.width / slot.height;
  let fdw: number, fdh: number;
  if (figAspect > slotRatio) { fdw = slot.width; fdh = fdw / figAspect; }
  else { fdh = slot.height; fdw = fdh * figAspect; }
  const fdx = slot.x + (slot.width - fdw) / 2;
  const anchor = slot.anchor ?? "bottom";
  const fdy = anchor === "top" ? slot.y : anchor === "center" ? slot.y + (slot.height - fdh) / 2 : slot.y + (slot.height - fdh);

  const selText = sel?.kind === "text" ? tpl.texts[sel.index] : null;
  const selLogo = sel?.kind === "logo" ? tpl.logos[sel.index] : null;

  const alignTranslate = (a?: string) => (a === "center" ? "-50%" : a === "right" ? "-100%" : "0");
  const baselineTranslate = (b?: string) =>
    b === "top" ? "0" : b === "middle" ? "-50%" : b === "bottom" ? "-100%" : "-82%";

  return (
    <main className="wrap wrap--wide poster-designer">
      <style>{fontCss}</style>
      <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={onAddImage} />
      <input ref={bgInputRef} type="file" accept="image/*" hidden onChange={onSwapBackground} />
      <input ref={replaceInputRef} type="file" accept="image/*" hidden onChange={onReplaceImage} />

      <div className="pd-head">
        <div>
          <h1>Poster designer</h1>
          <p className="subtitle">
            Drag text and logos to place them. Changes apply to new posters as soon as you save.
          </p>
        </div>
        <div className="pd-actions">
          <button className="btn btn--ghost" onClick={() => fileInputRef.current?.click()}>+ Image / logo</button>
          <button className="btn btn--ghost" onClick={addText}>+ Text</button>
          <button className="btn btn--ghost" onClick={() => bgInputRef.current?.click()}>Swap background</button>
          <button className="btn btn--ghost" onClick={openRealPreview}>Preview real poster</button>
          <button className="btn btn--ghost" onClick={reset} disabled={saving}>Reset</button>
          <button className="btn" onClick={save} disabled={saving || !dirty}>
            {saving ? "Saving…" : dirty ? "Save" : "Saved"}
          </button>
        </div>
      </div>

      <div className="pd-body">
        {/* ---- stage ---- */}
        <div className="pd-stage-wrap" ref={wrapRef}>
          <div
            className="pd-stage"
            style={{ width: stageW, height: tpl.height * scale }}
            onPointerDown={() => setSel(null)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="pd-bg" src={assetSrc(tpl.background)} alt="" draggable={false}
              style={{ width: stageW, height: tpl.height * scale }} />
            {/* figure stand-in */}
            {figureUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="pd-figure" src={figureUrl} alt="" draggable={false}
                style={{ left: fdx * scale, top: fdy * scale, width: fdw * scale, height: fdh * scale }} />
            )}

            {/* logos */}
            {tpl.logos.map((lg, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`logo-${i}`}
                src={assetSrc(lg.default)}
                alt=""
                draggable={false}
                className={`pd-el pd-logo ${sel?.kind === "logo" && sel.index === i ? "pd-el--sel" : ""}`}
                style={{
                  left: lg.x * scale, top: lg.y * scale,
                  width: (lg.width ?? 160) * scale, height: "auto",
                  transform: `translateX(${alignTranslate(lg.align)})`,
                }}
                onPointerDown={(e) => onElementPointerDown(e, "logo", i, "move")}
              />
            ))}
            {/* resize handles for the selected logo */}
            {selLogo && (
              <div
                className="pd-resize"
                style={{
                  left: (selLogo.x + (selLogo.align === "center" ? (selLogo.width ?? 160) / 2 : selLogo.align === "right" ? 0 : (selLogo.width ?? 160))) * scale,
                  top: (selLogo.y + (selLogo.width ?? 160) / 2) * scale,
                }}
                onPointerDown={(e) => onElementPointerDown(e, "logo", sel!.index, "resize")}
              />
            )}

            {/* texts */}
            {tpl.texts.map((t, i) => {
              const val = (t.uppercase ? t.default.toUpperCase() : t.default) || " ";
              return (
                <div
                  key={`text-${i}`}
                  className={`pd-el pd-text ${sel?.kind === "text" && sel.index === i ? "pd-el--sel" : ""}`}
                  style={{
                    left: t.x * scale, top: t.y * scale,
                    transform: `translate(${alignTranslate(t.align)}, ${baselineTranslate(t.baseline)})`,
                    fontFamily: `"${t.font ?? "Noto Sans"}"`,
                    fontSize: t.size * scale,
                    fontWeight: t.weight === "bold" ? 700 : 400,
                    color: t.color,
                    textShadow: t.shadow ? `${(t.shadow.x ?? 0) * scale}px ${(t.shadow.y ?? 0) * scale}px ${(t.shadow.blur ?? 0) * scale}px ${t.shadow.color}` : undefined,
                    WebkitTextStroke: t.stroke ? `${t.stroke.width * scale}px ${t.stroke.color}` : undefined,
                    paintOrder: "stroke",
                  }}
                  onPointerDown={(e) => onElementPointerDown(e, "text", i, "move")}
                >
                  {val}
                </div>
              );
            })}
          </div>
          <p className="pd-hint">
            Layout preview — fonts &amp; positions are accurate; fine shadow/outline may differ slightly.
            Use <strong>Preview real poster</strong> to see the exact output.
          </p>
        </div>

        {/* ---- properties ---- */}
        <aside className="pd-panel">
          {!sel && <p className="subtitle">Select a text or logo to edit it, or add one from the toolbar.</p>}

          {selText && (
            <div className="pd-props">
              <h3>Text</h3>
              <label className="pd-field">
                <span>Words</span>
                <textarea rows={2} value={selText.default}
                  onChange={(e) => patchText(sel!.index, { default: e.target.value })} />
              </label>
              <label className="pd-field">
                <span>Font</span>
                <select value={selText.font ?? "Noto Sans"} onChange={(e) => patchText(sel!.index, { font: e.target.value })}>
                  {fonts.map((f) => <option key={f.family} value={f.family}>{f.label}</option>)}
                </select>
              </label>
              <div className="pd-row">
                <label className="pd-field">
                  <span>Size {Math.round(selText.size)}</span>
                  <input type="range" min={10} max={200} value={selText.size}
                    onChange={(e) => patchText(sel!.index, { size: Number(e.target.value) })} />
                </label>
                <label className="pd-field pd-field--color">
                  <span>Colour</span>
                  <input type="color" value={/^#([0-9a-f]{6})$/i.test(selText.color) ? selText.color : "#ffffff"}
                    onChange={(e) => patchText(sel!.index, { color: e.target.value })} />
                </label>
              </div>
              <div className="pd-field">
                <span>Alignment</span>
                <div className="pd-seg">
                  {(["left", "center", "right"] as const).map((a) => (
                    <button key={a} className={selText.align === a ? "on" : ""}
                      onClick={() => patchText(sel!.index, { align: a })}>{a}</button>
                  ))}
                </div>
              </div>
              <div className="pd-toggles">
                <label><input type="checkbox" checked={selText.weight === "bold"}
                  onChange={(e) => patchText(sel!.index, { weight: e.target.checked ? "bold" : "" })} /> Bold</label>
                <label><input type="checkbox" checked={!!selText.uppercase}
                  onChange={(e) => patchText(sel!.index, { uppercase: e.target.checked })} /> UPPERCASE</label>
                <label><input type="checkbox" checked={!!selText.shadow}
                  onChange={(e) => patchText(sel!.index, { shadow: e.target.checked ? { ...DEFAULT_SHADOW } : undefined })} /> Shadow</label>
                <label><input type="checkbox" checked={!!selText.stroke}
                  onChange={(e) => patchText(sel!.index, { stroke: e.target.checked ? { ...DEFAULT_STROKE } : undefined })} /> Outline</label>
              </div>
              <button className="btn btn--danger btn--block" onClick={deleteSelected}>Delete text</button>
            </div>
          )}

          {selLogo && (
            <div className="pd-props">
              <h3>Image / logo</h3>
              <button className="btn btn--ghost btn--block" onClick={() => replaceInputRef.current?.click()}>Replace image…</button>
              <label className="pd-field">
                <span>Width {Math.round(selLogo.width ?? 160)}px</span>
                <input type="range" min={24} max={Math.round(tpl.width)} value={selLogo.width ?? 160}
                  onChange={(e) => patchLogo(sel!.index, { width: Number(e.target.value) })} />
              </label>
              <div className="pd-field">
                <span>Anchor</span>
                <div className="pd-seg">
                  {(["left", "center", "right"] as const).map((a) => (
                    <button key={a} className={selLogo.align === a ? "on" : ""}
                      onClick={() => patchLogo(sel!.index, { align: a })}>{a}</button>
                  ))}
                </div>
              </div>
              <button className="btn btn--danger btn--block" onClick={deleteSelected}>Delete image</button>
            </div>
          )}
        </aside>
      </div>

      {previewOpen && (
        <div className="pd-modal" onClick={() => setPreviewOpen(null)}>
          <div className="pd-modal-inner" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewOpen} alt="Real poster preview" />
            <p className="subtitle">Exact server-rendered poster (with a stand-in guest). Click outside to close.</p>
          </div>
        </div>
      )}
    </main>
  );
}
