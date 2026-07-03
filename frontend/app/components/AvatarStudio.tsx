"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { BASE_PATH } from "@/lib/basePath";
import { useAdminHome } from "./useAdminHome";

// The avatar CAPTURE station — a full-screen camera kiosk, nothing else. The
// operator asks the guest which they want, picks the mode, and taps Capture; the
// station then BLOCKS on generation (a spinner) which self-throttles the serialized
// GPU — the operator can't fire another shot until this one lands. On success the
// figures are pushed to the live wall and the station resets for the next guest.
// The guest never sees a result here; they pick + download at /admin/avatar/gallery.

type Mode = "kelvin" | "group";
type Phase = "live" | "generating" | "done";
type CamError = "insecure" | "denied" | "notfound" | "other" | null;

const KELVIN_VARIANTS = 4; // 1 arm-around + 3 pose-follow, chosen at the gallery
const RESET_MS = 6000; // auto-return to live after a successful send

export default function AvatarStudio() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [started, setStarted] = useState(false);
  const [mode, setMode] = useState<Mode>("kelvin");
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [phase, setPhase] = useState<Phase>("live");
  const [camError, setCamError] = useState<CamError>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetIn, setResetIn] = useState(0);
  const homeHref = useAdminHome();

  // Low-level: (re)open the stream on the requested camera. Releases the current
  // one first — mobile devices usually allow only one active camera at a time.
  // Throws on failure so callers can decide how to surface it.
  const acquire = useCallback(async (mode: "user" | "environment") => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 960 } },
    });
    streamRef.current = stream;
    const video = videoRef.current;
    if (video) {
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      const tryPlay = () => video.play().catch(() => {});
      if (video.readyState >= 1) tryPlay();
      video.onloadedmetadata = tryPlay;
    }
    return stream;
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setCamError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setCamError("insecure");
      return;
    }
    try {
      await acquire(facing);
      setStarted(true);
    } catch (e) {
      const name = (e as DOMException)?.name;
      if (name === "NotAllowedError" || name === "SecurityError") setCamError("denied");
      else if (name === "NotFoundError" || name === "OverconstrainedError") setCamError("notfound");
      else setCamError("other");
    }
  }, [acquire, facing]);

  // Flip front <-> back. On failure (e.g. no rear camera) keep the working camera
  // and just toast — don't drop the operator into the full camera-error screen.
  const flipCamera = useCallback(async () => {
    const next = facing === "user" ? "environment" : "user";
    try {
      await acquire(next);
      setFacing(next);
    } catch {
      setError("Couldn't switch camera.");
      try {
        await acquire(facing);
      } catch {
        setCamError("other");
      }
    }
  }, [acquire, facing]);

  // Teardown on unmount only — the stream stays live across capture/generate/done
  // so returning to the next guest is instant.
  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    },
    [],
  );

  const backToLive = useCallback(() => {
    setError(null);
    setResetIn(0);
    setPhase("live");
  }, []);

  // Auto-reset countdown on the success screen.
  useEffect(() => {
    if (phase !== "done") return;
    let remaining = Math.round(RESET_MS / 1000);
    setResetIn(remaining);
    const interval = window.setInterval(() => {
      remaining -= 1;
      setResetIn(remaining);
      if (remaining <= 0) {
        window.clearInterval(interval);
        backToLive();
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [phase, backToLive]);

  const submit = useCallback(
    async (photo: Blob) => {
      setError(null);
      setPhase("generating");
      try {
        const fd = new FormData();
        fd.append("photo", photo, "photo.jpg");
        fd.append("mode", mode);
        if (mode === "kelvin") fd.append("variants", String(KELVIN_VARIANTS));

        const res = await fetch(`${BASE_PATH}/api/avatar`, { method: "POST", body: fd });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(body.error ?? "Generation failed. Try again.");
          setPhase("live");
          return;
        }
        setPhase("done");
      } catch {
        setError("Network error. Try again.");
        setPhase("live");
      }
    },
    [mode],
  );

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0); // raw (un-mirrored) frame for the GPU
    canvas.toBlob(
      (b) => {
        if (b) submit(b);
        else setError("Could not capture. Try again.");
      },
      "image/jpeg",
      0.92,
    );
  }, [submit]);

  const onUpload = useCallback(
    (file: File | null) => {
      if (file) submit(file);
    },
    [submit],
  );

  // ---- camera error ----
  if (camError) {
    const messages: Record<NonNullable<CamError>, string> = {
      insecure: "Camera needs HTTPS or localhost. Use the upload option instead.",
      denied: "Camera permission was denied. Allow it and retry, or upload a photo.",
      notfound: "No camera found on this device. Upload a photo instead.",
      other: "Could not start the camera. Upload a photo instead.",
    };
    return (
      <div className="kiosk-stage kiosk-stage--plain">
        <div className="kiosk-card" style={{ textAlign: "center" }}>
          <div className="notice notice--error">{messages[camError]}</div>
          <div className="kiosk-success-actions">
            <button className="btn btn--lg btn--block" onClick={start}>
              Retry camera
            </button>
            <label className="btn btn--ghost btn--block" style={{ display: "inline-flex", justifyContent: "center" }}>
              Upload a photo
              <input type="file" accept="image/*" hidden onChange={(e) => onUpload(e.target.files?.[0] ?? null)} />
            </label>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="kiosk-stage">
      <video
        ref={videoRef}
        className="kiosk-video"
        style={{ transform: facing === "user" ? "scaleX(-1)" : "none" }}
        playsInline
        muted
        autoPlay
      />

      <Link href={homeHref} className="kiosk-home" aria-label="Home">
        <span className="kiosk-x" aria-hidden />
      </Link>

      {/* ---- start gate (one tap to grant camera on iOS) ---- */}
      {!started && (
        <div className="kiosk-overlay kiosk-overlay--center">
          <div className="kiosk-card">
            <h1>Photo booth</h1>
            <p className="subtitle">Tap to start the camera, then choose a photo type.</p>
            <button className="btn btn--lg btn--block" onClick={start}>
              Start camera
            </button>
          </div>
        </div>
      )}

      {/* ---- live: mode selector (operator) + capture ---- */}
      {started && phase === "live" && (
        <>
          <button className="kiosk-flip" onClick={flipCamera} aria-label="Switch camera" title="Switch camera">
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M17 3l4 4-4 4" />
              <path d="M21 7H8a4 4 0 0 0-4 4v1" />
              <path d="M7 21l-4-4 4-4" />
              <path d="M3 17h13a4 4 0 0 0 4-4v-1" />
            </svg>
          </button>

          <div className="kiosk-modebar">
            <button
              className={`kiosk-mode ${mode === "kelvin" ? "kiosk-mode--active" : ""}`}
              onClick={() => setMode("kelvin")}
            >
              With Mr Kelvin
              <small>1 person</small>
            </button>
            <button
              className={`kiosk-mode ${mode === "group" ? "kiosk-mode--active" : ""}`}
              onClick={() => setMode("group")}
            >
              Group
              <small>up to 3</small>
            </button>
          </div>

          <p className="kiosk-instruction kiosk-guide">
            {mode === "kelvin"
              ? "One guest — stand back so your whole body is in frame."
              : "Up to 3 people — everyone full-body, facing the camera."}
          </p>

          <div className="kiosk-actions">
            {error && <div className="notice notice--error kiosk-toast">{error}</div>}
            <button className="btn btn--lg" onClick={capture}>
              Capture
            </button>
            <label className="kiosk-upload">
              Upload instead
              <input type="file" accept="image/*" hidden onChange={(e) => onUpload(e.target.files?.[0] ?? null)} />
            </label>
          </div>
        </>
      )}

      {/* ---- generating (station locked — this is the throttle) ---- */}
      {phase === "generating" && (
        <div className="kiosk-overlay kiosk-overlay--center">
          <div className="kiosk-card" style={{ textAlign: "center" }}>
            <div className="spinner" aria-hidden />
            <h2>Creating the figures…</h2>
            <p className="subtitle">
              {mode === "kelvin"
                ? "Mr Kelvin is striking a few poses with the guest. ~30 seconds."
                : "Turning everyone into figurines. This can take up to a minute."}
            </p>
            <p className="muted">Please wait — one photo at a time.</p>
          </div>
        </div>
      )}

      {/* ---- done: sent to the wall, ready for next ---- */}
      {phase === "done" && (
        <div className="kiosk-overlay kiosk-overlay--center">
          <div className="kiosk-card kiosk-card--ok" style={{ textAlign: "center" }}>
            <div className="kiosk-check" aria-hidden>
              <span className="kiosk-checkmark" />
            </div>
            <h1>Sent to the gallery!</h1>
            <p className="subtitle">The guest can pick and download it at the gallery station.</p>
            <div className="kiosk-success-actions">
              <button className="btn btn--lg btn--block" onClick={backToLive}>
                Next guest {resetIn > 0 && `(${resetIn})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
