"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { BASE_PATH } from "@/lib/basePath";
import { useAdminHome } from "./useAdminHome";
import FullscreenButton from "./FullscreenButton";

// Full-screen, passive slideshow of the photo-booth posters — meant for a TV or
// projector at the event. One poster at a time with a crossfade; loops the whole
// gallery (oldest-first, so indices stay stable as new captures append). New
// posters are pulled in on a poll and join the loop silently. Operator-gated
// (proxy /admin/*), so it runs on a display PC that's logged in once.

const SLIDE_MS = 6000; // time each poster is shown
const POLL_MS = 30000; // how often we check for newly captured posters

interface GalleryPoster {
  id: string;
  url: string;
}

export default function Slideshow() {
  const homeHref = useAdminHome();

  const [urls, setUrls] = useState<string[]>([]);
  const urlsRef = useRef<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [paused, setPaused] = useState(false);

  // Two stacked <img> layers; we preload the next poster then fade layers.
  const [layers, setLayers] = useState<[string, string]>(["", ""]);
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);
  const idxRef = useRef(-1);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  // Fetch the gallery and flatten every set's posters into a flat url list.
  const fetchGallery = useCallback(async () => {
    try {
      const r = await fetch(`${BASE_PATH}/api/avatar/gallery`, { cache: "no-store" });
      const b = (await r.json()) as {
        sets?: { posters?: GalleryPoster[] }[];
      };
      const list: string[] = [];
      for (const s of b.sets ?? []) for (const p of s.posters ?? []) list.push(p.url);
      // The API returns newest-first; reverse to oldest-first so new captures
      // append at the END and existing loop positions stay stable.
      list.reverse();
      urlsRef.current = list;
      setUrls(list);
    } catch {
      /* keep whatever we have */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    fetchGallery();
    const id = window.setInterval(fetchGallery, POLL_MS);
    return () => window.clearInterval(id);
  }, [fetchGallery]);

  // Preload target poster, then swap it onto the inactive layer and fade.
  const show = useCallback((nextIdx: number) => {
    const list = urlsRef.current;
    if (list.length === 0) return;
    const i = ((nextIdx % list.length) + list.length) % list.length;
    idxRef.current = i;
    const url = list[i];
    const img = new Image();
    const swap = () => {
      const target = 1 - activeRef.current;
      setLayers((prev) => {
        const n: [string, string] = [prev[0], prev[1]];
        n[target] = url;
        return n;
      });
      setActive(target);
    };
    img.onload = swap;
    img.onerror = swap; // don't stall the show on a bad image
    img.src = url;
  }, []);

  const next = useCallback(() => show(idxRef.current + 1), [show]);
  const prev = useCallback(() => show(idxRef.current - 1), [show]);

  // Show the first poster once the gallery arrives.
  useEffect(() => {
    if (urls.length > 0 && idxRef.current === -1) show(0);
  }, [urls, show]);

  // Auto-advance.
  useEffect(() => {
    if (paused || urls.length === 0) return;
    const id = window.setInterval(() => show(idxRef.current + 1), SLIDE_MS);
    return () => window.clearInterval(id);
  }, [paused, urls, show]);

  // Keyboard: arrows to step, space to pause.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === " ") {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev]);

  const empty = loaded && urls.length === 0;

  return (
    <div className="slideshow" onClick={() => setPaused((p) => !p)}>
      <FullscreenButton className="slideshow-fs" stopPropagation />
      <Link
        href={homeHref}
        className="slideshow-exit"
        aria-label="Exit slideshow"
        onClick={(e) => e.stopPropagation()}
      >
        ✕
      </Link>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="slideshow-layer"
        style={{ opacity: active === 0 ? 1 : 0 }}
        src={layers[0] || undefined}
        alt=""
        draggable={false}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="slideshow-layer"
        style={{ opacity: active === 1 ? 1 : 0 }}
        src={layers[1] || undefined}
        alt=""
        draggable={false}
      />

      {empty && (
        <div className="slideshow-empty">
          <h1>No posters yet</h1>
          <p>Captures from the photo booth will appear here automatically.</p>
        </div>
      )}

      {!empty && paused && <div className="slideshow-badge">Paused</div>}

      {!empty && (
        <div className="slideshow-controls" onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={prev} aria-label="Previous">
            ‹
          </button>
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-label={paused ? "Play" : "Pause"}
          >
            {paused ? "▶" : "❚❚"}
          </button>
          <button type="button" onClick={next} aria-label="Next">
            ›
          </button>
        </div>
      )}
    </div>
  );
}
