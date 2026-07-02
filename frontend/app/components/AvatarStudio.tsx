"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BASE_PATH } from "@/lib/basePath";

// Event avatar flow: capture a full-body photo -> generate the stylized figure on the
// GPU -> composite onto the fixed event template -> reveal the poster. The figure is
// the only AI-generated part; the background, birthday-guy, text and logos are fixed
// or composited deterministically by the bridge (see avatar-gen-contract.md).

type Phase = "camera" | "preview" | "generating" | "done";
type CamError = "insecure" | "denied" | "notfound" | "other" | null;

export default function AvatarStudio() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [phase, setPhase] = useState<Phase>("camera");
  const [camError, setCamError] = useState<CamError>(null);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Customizable copy (maps to template text ids: title, pioneer).
  const [title, setTitle] = useState("It All Starts Here");
  const [caption, setCaption] = useState("");

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
        // Same robust play path that fixed the check-in camera: play now if metadata
        // is ready, and again once it loads (covers both event orderings).
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

  // Start the camera whenever we (re)enter the camera phase.
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
      fd.append("photo", photo, "fullbody.jpg");
      if (title.trim()) fd.append("text:title", title.trim());
      if (caption.trim()) fd.append("text:pioneer", caption.trim());
      const res = await fetch(`${BASE_PATH}/api/avatar`, { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Generation failed. Try again.");
        setPhase("preview");
        return;
      }
      setPosterUrl(body.url as string);
      setPhase("done");
    } catch {
      setError("Network error. Try again.");
      setPhase("preview");
    }
  }, [photo, title, caption]);

  const startOver = useCallback(() => {
    setPhotoBlob(null);
    setPosterUrl(null);
    setError(null);
    setPhase("camera");
  }, [setPhotoBlob]);

  // ---- camera error ----
  if (camError) {
    const messages: Record<NonNullable<CamError>, string> = {
      insecure: "Camera needs HTTPS or localhost. Use the upload option instead.",
      denied: "Camera permission was denied. Allow it and retry, or upload a photo.",
      notfound: "No camera found on this device. Upload a photo instead.",
      other: "Could not start the camera. Upload a photo instead.",
    };
    return (
      <div className="panel">
        <div className="notice notice--error">{messages[camError]}</div>
        <div className="row">
          <button className="btn" onClick={startCamera}>
            Retry camera
          </button>
          <label className="btn btn--ghost" style={{ margin: 0, display: "inline-flex" }}>
            Upload full-body photo
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => onUpload(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
      </div>
    );
  }

  // ---- generating ----
  if (phase === "generating") {
    return (
      <div className="panel" style={{ textAlign: "center" }}>
        <div className="spinner" aria-hidden />
        <h2 style={{ marginBottom: 4 }}>Creating your figure…</h2>
        <p className="subtitle">Striking a pose. This can take a moment.</p>
      </div>
    );
  }

  // ---- done ----
  if (phase === "done" && posterUrl) {
    return (
      <div className="panel" style={{ textAlign: "center" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={posterUrl} alt="Your event poster" className="avatar-poster" />
        <div className="row" style={{ justifyContent: "center", marginTop: 14 }}>
          <a className="btn" href={posterUrl} download="event-poster.png">
            Download
          </a>
          <button className="btn btn--ghost" onClick={startOver}>
            Start over
          </button>
        </div>
      </div>
    );
  }

  // ---- preview (confirm + customize) ----
  if (phase === "preview" && preview) {
    return (
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

        <button className="btn btn--lg btn--block" style={{ marginTop: 16 }} onClick={generate}>
          Generate my poster
        </button>
        <button className="btn btn--ghost btn--block" style={{ marginTop: 10 }} onClick={startOver}>
          Retake
        </button>
      </div>
    );
  }

  // ---- camera (default) ----
  return (
    <div>
      <div className="video-shell video-shell--tall">
        <video ref={videoRef} playsInline muted autoPlay />
        <div className="bodyguide" aria-hidden>
          <span>Stand back — fit your whole body in frame</span>
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
    </div>
  );
}
