"use client";

import { useCallback, useEffect, useState } from "react";

// Wrapper around the browser Fullscreen API (with the WebKit-prefixed fallback
// for Safari/iPad kiosks). Toggles the whole document into real fullscreen so the
// browser chrome hides — beyond our own bare full-screen layouts. `supported` is
// false where the API is unavailable (e.g. iOS Safari), so callers can hide the
// button.

interface FsDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
}
interface FsElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

function fsElement(): Element | null {
  const d = document as FsDocument;
  return document.fullscreenElement ?? d.webkitFullscreenElement ?? null;
}

export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    const el = document.documentElement as FsElement;
    setSupported(
      !!(el.requestFullscreen || el.webkitRequestFullscreen),
    );
    const onChange = () => setIsFullscreen(!!fsElement());
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    onChange();
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, []);

  const toggle = useCallback(async () => {
    const d = document as FsDocument;
    const el = document.documentElement as FsElement;
    try {
      if (fsElement()) {
        await (document.exitFullscreen?.() ?? d.webkitExitFullscreen?.());
      } else {
        await (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.());
      }
    } catch {
      /* user gesture required / denied / unsupported — ignore */
    }
  }, []);

  return { isFullscreen, toggle, supported };
}
