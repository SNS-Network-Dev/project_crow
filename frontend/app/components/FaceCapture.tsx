"use client";

import { useEffect } from "react";
import useFaceAutoCapture from "./useFaceAutoCapture";

// Fullscreen take-photo modal for /register. Uses the same MediaPipe BlazeFace
// alignment ring + auto-capture as the check-in kiosk. Opens when `open` is true,
// captures automatically when the guest's face is centered, then closes.

interface Props {
  open: boolean;
  onClose: () => void;
  onCapture: (blob: Blob) => void;
  onError?: (message: string) => void;
}

export default function FaceCapture({
  open,
  onClose,
  onCapture,
  onError,
}: Props) {
  const handleCapture = (blob: Blob) => {
    onCapture(blob);
    onClose();
  };

  const { videoRef, ring, camError, phase, start, stop, resetRing } =
    useFaceAutoCapture(handleCapture);

  useEffect(() => {
    if (open) {
      start();
    } else {
      stop();
      resetRing();
    }
  }, [open, start, stop, resetRing]);

  if (!open) return null;

  const errorText = camError
    ? {
        insecure: "Camera needs HTTPS or localhost.",
        denied:
          "Camera permission was denied. Allow it in the browser and reload.",
        notfound: "No camera found on this device.",
        other: "Could not start the camera.",
      }[camError]
    : null;

  if (errorText) onError?.(errorText);

  return (
    <div className="kiosk-stage">
      <video
        ref={videoRef}
        className="kiosk-video"
        playsInline
        muted
        autoPlay
      />

      <button
        type="button"
        className="kiosk-home"
        aria-label="Close"
        onClick={onClose}
      >
        <span className="kiosk-x" aria-hidden />
      </button>

      {camError && (
        <div className="kiosk-overlay kiosk-overlay--center">
          <div className="kiosk-card">
            <div className="notice notice--error">{errorText}</div>
            <button className="btn btn--lg" onClick={start}>
              Retry
            </button>
            <button className="btn btn--ghost btn--lg" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {phase === "idle" && !camError && (
        <div className="kiosk-overlay kiosk-overlay--center">
          <div className="kiosk-card">
            <h1>Take photo</h1>
            <p className="subtitle">
              Line up your face in the circle. We&apos;ll capture it
              automatically.
            </p>
            <button className="btn btn--lg btn--block" onClick={start}>
              Start camera
            </button>
          </div>
        </div>
      )}

      {phase === "live" && !camError && (
        <div className="kiosk-overlay">
          <div className={`face-ring face-ring--${ring.state}`}>
            {ring.state === "aligned" && (
              <span className="kiosk-count">{ring.count}</span>
            )}
          </div>
          <p className="kiosk-instruction">{ring.hint}</p>
        </div>
      )}

      {phase === "captured" && !camError && (
        <div className="kiosk-overlay kiosk-overlay--center">
          <div
            className="kiosk-card kiosk-card--ok"
            style={{ textAlign: "center" }}
          >
            <div className="kiosk-check" aria-hidden>
              <span className="kiosk-checkmark" />
            </div>
            <h2>Photo captured</h2>
          </div>
        </div>
      )}
    </div>
  );
}
