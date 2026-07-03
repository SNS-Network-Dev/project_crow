"use client";

import Link from "next/link";
import qrcode from "qrcode-generator";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BASE_PATH } from "@/lib/basePath";
import { useAdminHome } from "./useAdminHome";

// The pickup "live wall". Polls the gallery feed; shows every finished capture
// newest-first. A guest finds their set, taps the pose(s) they want, and gets a
// QR that opens the PUBLIC /d/<token> download page on their phone. Nothing is
// generated here — this is purely selection + handoff.

interface Poster {
  id: string;
  url: string;
  variant: string | null;
  seed: number | null;
}
interface GallerySet {
  id: string;
  createdAt: number;
  mode: "kelvin" | "group";
  posters: Poster[];
}

const POLL_MS = 3000;

const VARIANT_LABEL: Record<string, string> = {
  "arm-around": "Arm around",
  "pose-follow": "Your pose",
  group: "Group",
  "group+kelvin": "+ Mr Kelvin",
};

// base64url of the joined ids — matches decodeSelection() on the server.
function encodeSelection(ids: string[]): string {
  return btoa(ids.join(","))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function timeAgo(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return `${h} hr ago`;
}

export default function AvatarGallery() {
  const [sets, setSets] = useState<GallerySet[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const homeHref = useAdminHome();
  const timer = useRef<number | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_PATH}/api/avatar/gallery`, { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { sets: GallerySet[] };
      setSets(body.sets ?? []);
    } catch {
      /* keep last-known wall on a transient error */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    poll();
    timer.current = window.setInterval(poll, POLL_MS);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [poll]);

  // Drop selections whose poster has aged off the wall.
  useEffect(() => {
    const live = new Set(sets.flatMap((s) => s.posters.map((p) => p.id)));
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => live.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [sets]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const qrDataUrl = useMemo(() => {
    if (!qrUrl) return null;
    const qr = qrcode(0, "M");
    qr.addData(qrUrl);
    qr.make();
    return qr.createDataURL(7, 4);
  }, [qrUrl]);

  const makeQr = useCallback(() => {
    const ids = [...selected];
    if (ids.length === 0) return;
    const token = encodeSelection(ids);
    setQrUrl(`${window.location.origin}${BASE_PATH}/d/${token}`);
  }, [selected]);

  return (
    <div className="gallery">
      <header className="gallery-head">
        <div>
          <h1>Photo gallery</h1>
          <p className="subtitle">Pick the photos you want, then scan the QR to save them.</p>
        </div>
        <Link href={homeHref} className="gallery-home" aria-label="Home">
          <span className="kiosk-x" aria-hidden />
        </Link>
      </header>

      {loaded && sets.length === 0 && (
        <div className="gallery-empty">
          <div className="spinner" aria-hidden />
          <h2>Waiting for photos…</h2>
          <p className="subtitle">New captures appear here automatically.</p>
        </div>
      )}

      <div className="gallery-grid">
        {sets.map((set) => (
          <section key={set.id} className="gset">
            <div className="gset-head">
              <span className={`gbadge gbadge--${set.mode}`}>
                {set.mode === "kelvin" ? "With Mr Kelvin" : "Group"}
              </span>
              <span className="gset-time">{timeAgo(set.createdAt)}</span>
            </div>
            <div className="gset-thumbs">
              {set.posters.map((p) => {
                const isSel = selected.has(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`gthumb ${isSel ? "gthumb--selected" : ""}`}
                    onClick={() => toggle(p.id)}
                    aria-pressed={isSel}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={p.variant ?? "poster"} loading="lazy" />
                    {p.variant && <span className="gthumb-tag">{VARIANT_LABEL[p.variant] ?? p.variant}</span>}
                    <span className="gthumb-check" aria-hidden />
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {selected.size > 0 && (
        <div className="gallery-bar">
          <span className="gallery-bar-count">
            {selected.size} photo{selected.size > 1 ? "s" : ""} selected
          </span>
          <div className="row">
            <button className="btn btn--ghost" onClick={() => setSelected(new Set())}>
              Clear
            </button>
            <button className="btn" onClick={makeQr}>
              Get download QR
            </button>
          </div>
        </div>
      )}

      {qrUrl && (
        <div className="qr-backdrop" onClick={() => setQrUrl(null)}>
          <div className="qr-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Scan to save</h2>
            <p className="subtitle">Point your phone camera at the code to open your photos.</p>
            {qrDataUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img className="qr-img" src={qrDataUrl} alt="Download QR code" />
            )}
            <button className="btn btn--block" onClick={() => setQrUrl(null)}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
