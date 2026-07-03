"use client";

import useFaceAutoCapture from "./useFaceAutoCapture";

// Contained face-alignment auto-capture for forms (e.g. /register).
// Wraps useFaceAutoCapture with a start button, video preview, alignment ring,
// and hint text. Calls onCapture(blob) when the user's face is centered and held
// still.

interface Props {
  onCapture: (blob: Blob) => void;
  onError?: (message: string) => void;
  className?: string;
}

export default function FaceCapture({
  onCapture,
  onError,
  className = "",
}: Props) {
  const { videoRef, ring, camError, phase, start } =
    useFaceAutoCapture(onCapture);

  if (camError) {
    const messages: Record<typeof camError & string, string> = {
      insecure: "Camera needs HTTPS or localhost.",
      denied:
        "Camera permission was denied. Allow it in the browser and reload.",
      notfound: "No camera found on this device.",
      other: "Could not start the camera.",
    };
    onError?.(messages[camError] ?? "Could not start the camera.");
    return (
      <div className={className}>
        <div className="notice notice--error">
          {messages[camError] ?? "Could not start the camera."}
        </div>
        <button type="button" className="btn" onClick={start}>
          Retry camera
        </button>
      </div>
    );
  }

  return (
    <div className={`face-capture ${className}`}>
      {phase === "idle" && (
        <button
          type="button"
          className="btn btn--lg btn--block"
          onClick={start}
        >
          Start camera
        </button>
      )}

      {phase !== "idle" && (
        <div className="face-capture-shell">
          <video
            ref={videoRef}
            className="face-capture-video"
            playsInline
            muted
            autoPlay
          />
          {phase === "live" && (
            <>
              <div className={`face-ring face-ring--${ring.state}`}>
                {ring.state === "aligned" && (
                  <span className="face-count">{ring.count}</span>
                )}
              </div>
              <p className="face-hint">{ring.hint}</p>
            </>
          )}
          {phase === "captured" && (
            <div className="face-captured-overlay">
              <span className="face-captured-check" aria-hidden />
              <p className="face-hint">Photo captured</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
