"use client";

import qrcode from "qrcode-generator";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BASE_PATH } from "@/lib/basePath";

// The pickup "live wall". Polls the gallery feed; shows every finished capture
// newest-first grouped by session. A guest finds their photo, taps the top-right
// checkmark to select it, and clicks the photo body to open a larger preview.
// Selected photos become a QR that opens the PUBLIC /d/<token> download page.

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

function formatSessionTime(ms: number): string {
  return new Date(ms).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AvatarGallery() {
  const [sets, setSets] = useState<GallerySet[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [modalPoster, setModalPoster] = useState<Poster | null>(null);
  const timer = useRef<number | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_PATH}/api/avatar/gallery`, {
        cache: "no-store",
      });
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
    const t1 = window.setTimeout(poll, 0);
    timer.current = window.setInterval(poll, POLL_MS);
    return () => {
      window.clearTimeout(t1);
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [poll]);

  // Drop selections whose poster has aged off the wall.
  useEffect(() => {
    const t = window.setTimeout(() => {
      const live = new Set(sets.flatMap((s) => s.posters.map((p) => p.id)));
      setSelected((prev) => {
        const next = new Set([...prev].filter((id) => live.has(id)));
        return next.size === prev.size ? prev : next;
      });
    }, 0);
    return () => window.clearTimeout(t);
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
    <div className="gallery gallery--with-sidebar">
      <header className="gallery-head">
        <h1>Photo gallery</h1>
      </header>

      {loaded && sets.length === 0 && (
        <div className="gallery-empty">
          <div className="spinner" aria-hidden />
          <h2>Waiting for photos…</h2>
          <p className="subtitle">New captures appear here automatically.</p>
        </div>
      )}

      <div className="gallery-grid">
        {sets.map((set, setIndex) => (
          <section key={set.id} className="gset">
            <div className="gset-head">
              <span className="gset-title">
                Session {sets.length - setIndex}
              </span>
              <span
                className="gset-time"
                title={formatSessionTime(set.createdAt)}
              >
                {timeAgo(set.createdAt)} · {set.posters.length} photo
                {set.posters.length > 1 ? "s" : ""}
              </span>
            </div>
            <div className="gset-thumbs">
              {set.posters.map((p) => {
                const isSel = selected.has(p.id);
                return (
                  <div
                    key={p.id}
                    className={`gthumb ${isSel ? "gthumb--selected" : ""}`}
                  >
                    <button
                      type="button"
                      className="gthumb-photo"
                      onClick={() => setModalPoster(p)}
                      aria-label="View photo"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt="Captured photo" loading="lazy" />
                    </button>
                    <button
                      type="button"
                      className="gthumb-check"
                      aria-pressed={isSel}
                      aria-label={isSel ? "Deselect photo" : "Select photo"}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle(p.id);
                      }}
                    >
                      <span className="gthumb-checkmark" aria-hidden />
                    </button>
                  </div>
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
            <button
              className="btn btn--ghost"
              onClick={() => setSelected(new Set())}
            >
              Clear
            </button>
            <button className="btn" onClick={makeQr}>
              Get download QR
            </button>
          </div>
        </div>
      )}

      {/* Photo lightbox modal */}
      {modalPoster && (
        <div className="photo-backdrop" onClick={() => setModalPoster(null)}>
          <button
            type="button"
            className="photo-modal-close"
            aria-label="Close"
            onClick={() => setModalPoster(null)}
          >
            <span className="kiosk-x" aria-hidden />
          </button>
          <div className="photo-modal" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={`photo-modal-select ${selected.has(modalPoster.id) ? "photo-modal-select--active" : ""}`}
              aria-pressed={selected.has(modalPoster.id)}
              aria-label={
                selected.has(modalPoster.id) ? "Deselect photo" : "Select photo"
              }
              onClick={() => toggle(modalPoster.id)}
            >
              <span className="gthumb-checkmark" aria-hidden />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={modalPoster.url} alt="Captured photo" />
          </div>
        </div>
      )}

      {/* QR download modal */}
      {qrUrl && (
        <div className="qr-backdrop" onClick={() => setQrUrl(null)}>
          <div className="qr-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Scan to save</h2>
            <p className="subtitle">
              Point your phone camera at the code to open your photos.
            </p>
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
