"use client";

import { useFullscreen } from "./useFullscreen";

// Icon button that toggles browser fullscreen. Renders nothing where the API is
// unsupported. Pass a className for per-surface positioning; the base `.fs-btn`
// class styles the look.
export default function FullscreenButton({
  className = "",
  stopPropagation = false,
}: {
  className?: string;
  stopPropagation?: boolean;
}) {
  const { isFullscreen, toggle, supported } = useFullscreen();
  if (!supported) return null;

  return (
    <button
      type="button"
      className={`fs-btn ${className}`.trim()}
      aria-label={isFullscreen ? "Exit full screen" : "Full screen"}
      title={isFullscreen ? "Exit full screen" : "Full screen"}
      onClick={(e) => {
        if (stopPropagation) e.stopPropagation();
        toggle();
      }}
    >
      {isFullscreen ? (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M8 3v3a2 2 0 0 1-2 2H3" />
          <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
          <path d="M3 16h3a2 2 0 0 1 2 2v3" />
          <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 8V5a2 2 0 0 1 2-2h3" />
          <path d="M16 3h3a2 2 0 0 1 2 2v3" />
          <path d="M21 16v3a2 2 0 0 1-2 2h-3" />
          <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
        </svg>
      )}
    </button>
  );
}
