"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { BASE_PATH } from "@/lib/basePath";
import { useAdminHome } from "./useAdminHome";

// Event avatar flow. Capture a photo -> GPU generates stylized figurine(s) -> the bridge
// composites onto the fixed event poster -> reveal. Two modes (see AVATAR_API_HANDOFF.md):
//   • "kelvin": one guest posed WITH Mr Kelvin; we request several poses and let the guest
//     pick their favourite (1 arm-around + pose-follow takes that mirror the guest's gesture).
//   • "group":  a group photo (up to 4 people) -> side-by-side figurines, optionally + Kelvin.

type Mode = "kelvin" | "group";
type Phase = "camera" | "preview" | "generating" | "choose" | "done";
type CamError = "insecure" | "denied" | "notfound" | "other" | null;

interface Poster {
  id: string;
  url: string;
  variant: string | null;
  seed: number | null;
}

const KELVIN_VARIANTS = 4; // 1 arm-around + 3 pose-follow

const VARIANT_LABEL: Record<string, string> = {
  "arm-around": "Arm around",
  "pose-follow": "Your pose",
};

export default function AvatarStudio() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [mode, setMode] = useState<Mode>("kelvin");
  const [groupKelvin, setGroupKelvin] = useState(true);
  const [phase, setPhase] = useState<Phase>("camera");
  const [camError, setCamError] = useState<CamError>(null);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [posters, setPosters] = useState<Poster[]>([]);
  const [selected, setSelected] = useState<Poster | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Customizable copy (maps to template text ids: title, pioneer).
  const [title, setTitle] = useState("It All Starts Here");
  const [caption, setCaption] = useState("");
  const homeHref = useAdminHome();

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    setCamError(null);
    setError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setCamError("insecure");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
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
    } catch (e) {
      const name = (e as DOMException)?.name;
      if (name === "NotAllowedError" || name === "SecurityError") setCamError("denied");
      else if (name === "NotFoundError" || name === "OverconstrainedError") setCamError("notfound");
      else setCamError("other");
    }
  }, []);

  useEffect(() => {
    if (phase === "camera") startCamera();
    return () => {
      if (phase !== "camera") stopCamera();
    };
  }, [phase, startCamera, stopCamera]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const setPhotoBlob = useCallback((blob: Blob | null) => {
    setPhoto(blob);
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return blob ? URL.createObjectURL(blob) : null;
    });
  }, []);

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (b) => {
        if (b) {
          setPhotoBlob(b);
          stopCamera();
          setPhase("preview");
        }
      },
      "image/jpeg",
      0.92,
    );
  }, [setPhotoBlob, stopCamera]);

  const onUpload = useCallback(
    (file: File | null) => {
      if (!file) return;
      setPhotoBlob(file);
      stopCamera();
      setPhase("preview");
    },
    [setPhotoBlob, stopCamera],
  );

  const generate = useCallback(async () => {
    if (!photo) return;
    setError(null);
    setPhase("generating");
    try {
      const fd = new FormData();
      fd.append("photo", photo, "photo.jpg");
      fd.append("mode", mode);
      if (mode === "kelvin") fd.append("variants", String(KELVIN_VARIANTS));
      if (mode === "group" && groupKelvin) fd.append("kelvin", "1");
      if (title.trim()) fd.append("text:title", title.trim());
      if (caption.trim()) fd.append("text:pioneer", caption.trim());

      const res = await fetch(`${BASE_PATH}/api/avatar`, { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Generation failed. Try again.");
        setPhase("preview");
        return;
      }
      const list = (body.posters ?? []) as Poster[];
      if (list.length === 0) {
        setError("No poster was produced. Try again.");
        setPhase("preview");
        return;
      }
      setPosters(list);
      if (list.length === 1) {
        setSelected(list[0]);
        setPhase("done");
      } else {
        setPhase("choose");
      }
    } catch {
      setError("Network error. Try again.");
      setPhase("preview");
    }
  }, [photo, mode, groupKelvin, title, caption]);

  const startOver = useCallback(() => {
    setPhotoBlob(null);
    setPosters([]);
    setSelected(null);
    setError(null);
    setPhase("camera");
  }, [setPhotoBlob]);

  const stage = (children: ReactNode) => (
    <div style={{ position: "relative" }}>
      <Link href={homeHref} className="kiosk-home" aria-label="Home">
        <span className="kiosk-x" aria-hidden />
      </Link>
      {children}
    </div>
  );

  // ---- camera error ----
  if (camError) {
    const messages: Record<NonNullable<CamError>, string> = {
      insecure: "Camera needs HTTPS or localhost. Use the upload option instead.",
      denied: "Camera permission was denied. Allow it and retry, or upload a photo.",
      notfound: "No camera found on this device. Upload a photo instead.",
      other: "Could not start the camera. Upload a photo instead.",
    };
    return stage(
      <div className="panel">
        <div className="notice notice--error">{messages[camError]}</div>
        <div className="row">
          <button className="btn" onClick={startCamera}>
            Retry camera
          </button>
          <label className="btn btn--ghost" style={{ margin: 0, display: "inline-flex" }}>
            Upload photo
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => onUpload(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
      </div>,
    );
  }

  // ---- generating ----
  if (phase === "generating") {
    return stage(
      <div className="panel" style={{ textAlign: "center" }}>
        <div className="spinner" aria-hidden />
        <h2 style={{ marginBottom: 4 }}>
          {mode === "kelvin" ? "Creating your poses…" : "Creating your figurines…"}
        </h2>
        <p className="subtitle">
          {mode === "kelvin"
            ? "Mr Kelvin is striking a few poses with you. This takes ~30 seconds."
            : "Turning everyone into figurines. This can take a moment."}
        </p>
      </div>,
    );
  }

  // ---- choose a pose (kelvin variants) ----
  if (phase === "choose") {
    return stage(
      <div className="panel">
        <h2 style={{ marginBottom: 4 }}>Pick your favourite</h2>
        <p className="subtitle">Tap the pose you like best.</p>
        <div className="poster-grid">
          {posters.map((p) => (
            <button
              key={p.id}
              className="poster-choice"
              onClick={() => {
                setSelected(p);
                setPhase("done");
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.variant ?? "pose"} />
              {p.variant && <span className="poster-choice__tag">{VARIANT_LABEL[p.variant] ?? p.variant}</span>}
            </button>
          ))}
        </div>
        <button className="btn btn--ghost btn--block" style={{ marginTop: 12 }} onClick={startOver}>
          Retake
        </button>
      </div>,
    );
  }

  // ---- done ----
  if (phase === "done" && selected) {
    return stage(
      <div className="panel" style={{ textAlign: "center" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={selected.url} alt="Your event poster" className="avatar-poster" />
        <div className="row" style={{ justifyContent: "center", marginTop: 14 }}>
          <a className="btn" href={selected.url} download="event-poster.png">
            Download
          </a>
          {posters.length > 1 && (
            <button className="btn btn--ghost" onClick={() => setPhase("choose")}>
              Pick another
            </button>
          )}
          <button className="btn btn--ghost" onClick={startOver}>
            Start over
          </button>
        </div>
      </div>,
    );
  }

  // ---- preview (confirm + customize) ----
  if (phase === "preview" && preview) {
    return stage(
      <div className="panel">
        {error && <div className="notice notice--error">{error}</div>}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={preview} alt="Captured" className="avatar-shot" />

        <label htmlFor="title">Headline</label>
        <input id="title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} />

        <label htmlFor="caption">Caption (optional)</label>
        <input
          id="caption"
          type="text"
          value={caption}
          placeholder="e.g. Pioneers No. 3135"
          onChange={(e) => setCaption(e.target.value)}
        />

        {mode === "group" && (
          <div className="checkbox-row">
            <input
              id="groupKelvin"
              type="checkbox"
              checked={groupKelvin}
              onChange={(e) => setGroupKelvin(e.target.checked)}
            />
            <label htmlFor="groupKelvin" style={{ margin: 0, fontWeight: 400 }}>
              Add Mr Kelvin to the group
            </label>
          </div>
        )}

        <button className="btn btn--lg btn--block" style={{ marginTop: 16 }} onClick={generate}>
          {mode === "kelvin" ? "Generate poses with Mr Kelvin" : "Generate group poster"}
        </button>
        <button className="btn btn--ghost btn--block" style={{ marginTop: 10 }} onClick={startOver}>
          Retake
        </button>
      </div>,
    );
  }

  // ---- camera (default) ----
  return stage(
    <div>
      <div className="tab-bar" role="tablist">
        <button
          className={`tab ${mode === "kelvin" ? "tab--active" : ""}`}
          onClick={() => setMode("kelvin")}
        >
          Me + Mr Kelvin
        </button>
        <button
          className={`tab ${mode === "group" ? "tab--active" : ""}`}
          onClick={() => setMode("group")}
        >
          Group photo
        </button>
      </div>

      <div className="video-shell video-shell--tall">
        <video ref={videoRef} playsInline muted autoPlay />
        <div className="bodyguide" aria-hidden>
          <span>
            {mode === "kelvin"
              ? "Stand back — fit your whole body in frame"
              : "Fit everyone in frame (up to 4), standing, facing the camera"}
          </span>
        </div>
      </div>

      {error && <div className="notice notice--error">{error}</div>}
      <button className="btn btn--lg btn--block" style={{ marginTop: 14 }} onClick={capture}>
        Capture
      </button>
      <label
        className="btn btn--ghost btn--block"
        style={{ marginTop: 10, display: "inline-flex", justifyContent: "center" }}
      >
        Upload a photo instead
        <input
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => onUpload(e.target.files?.[0] ?? null)}
        />
      </label>
    </div>,
  );
}
