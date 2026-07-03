"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FaceDetector as MPFaceDetector } from "@mediapipe/tasks-vision";
import { BASE_PATH } from "@/lib/basePath";
import { useAdminHome } from "./useAdminHome";

// One unified, responsive check-in surface for BOTH phone (/checkin) and the iPad
// kiosk (/kiosk). It fills the screen in any orientation, detects the face in-browser
// (MediaPipe BlazeFace, self-hosted under /public/mediapipe) purely to drive an
// alignment ring + "hold still" countdown, then auto-captures and runs the existing
// recognition flow (/api/checkin -> /api/confirm). Recognition itself stays on the GPU.

interface Candidate {
  person_id: number;
  name: string;
  full_company_name: string | null;
  photo_url: string | null;
  score: number;
  confident: boolean;
}
type Phase = "live" | "matching" | "done" | "already";
type CamError = "insecure" | "denied" | "notfound" | "other" | null;
type RingState = "search" | "detect" | "aligned";

// Alignment tuning (normalized to the video frame).
const CENTER_TOL = 0.17; // how far off-center the face may be
const MIN_FACE = 0.2; // bbox height fraction — smaller => "come closer"
const MAX_FACE = 0.72; // larger => "lean back"
const HOLD_MS = 2500; // continuous alignment required before auto-capture
const DETECT_INTERVAL_MS = 90; // ~11 detections/sec is plenty for alignment
const DONE_RESET_MS = 3800; // hands-free return to live after a check-in

export default function CheckinKiosk() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<MPFaceDetector | null>(null);
  const captureRef = useRef<() => void>(() => {});
  const capturingRef = useRef(false);
  const holdStartRef = useRef(0);
  const lastDetectRef = useRef(0);
  const phaseRef = useRef<Phase>("live");
  const statusKeyRef = useRef("");

  const [started, setStarted] = useState(false);
  const [camError, setCamError] = useState<CamError>(null);
  const [phase, setPhase] = useState<Phase>("live");
  const [ring, setRing] = useState<{ state: RingState; hint: string; count: number }>({
    state: "search",
    hint: "Position your face in the circle",
    count: 0,
  });
  const [doneInfo, setDoneInfo] = useState<{ name: string; full_company_name: string | null } | null>(null);
  const [alreadyInfo, setAlreadyInfo] = useState<{ name: string; checked_in_at: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetCountdown, setResetCountdown] = useState(10);
  const resetCountdownRef = useRef(10);
  const homeHref = useAdminHome();

  // Callback ref so the detection loop can call the latest onMatched without
  // being declared before it. This avoids the ESLint "accessed before declared"
  // issue because the function is read from a ref, not closed over directly.
  const onMatchedRef = useRef<(candidate: Candidate) => void>(() => {});

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const backToLive = useCallback(() => {
    capturingRef.current = false;
    holdStartRef.current = 0;
    statusKeyRef.current = "";
    setDoneInfo(null);
    setError(null);
    setAlreadyInfo(null);
    resetCountdownRef.current = 10;
    setResetCountdown(10);
    setRing({ state: "search", hint: "Position your face in the circle", count: 0 });
    setPhase("live");
  }, []);

  const onMatched = useCallback(
    async (candidate: Candidate) => {
      setError(null);
      try {
        const res = await fetch(`${BASE_PATH}/api/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ person_id: candidate.person_id, score: candidate.score }),
        });
        const b = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          alreadyCheckedIn?: boolean;
          name?: string;
          full_company_name?: string | null;
          checked_in_at?: string;
          error?: string;
        };
        if (!res.ok) {
          setError(b.error ?? "Could not record check-in.");
          return;
        }
        // One check-in per person: server reports a prior check-in instead of
        // recording a duplicate. Notify the operator and return to live.
        if (b.alreadyCheckedIn) {
          setAlreadyInfo({
            name: b.name ?? candidate.name,
            checked_in_at: b.checked_in_at ?? "",
          });
          setPhase("already");
          phaseRef.current = "already";
          window.setTimeout(backToLive, DONE_RESET_MS);
          return;
        }
        setDoneInfo({
          name: b.name ?? candidate.name,
          full_company_name: b.full_company_name ?? candidate.full_company_name,
        });
        setPhase("done");
        phaseRef.current = "done";
      } catch {
        setError("Network error recording check-in.");
      }
    },
    [backToLive],
  );

  useEffect(() => {
    onMatchedRef.current = onMatched;
  }, [onMatched]);

  // 10-second countdown on the success screen; auto-returns to live detection.
  useEffect(() => {
    if (phase !== "done") return;
    let remaining = resetCountdownRef.current;
    const interval = window.setInterval(() => {
      remaining -= 1;
      setResetCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        backToLive();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [phase, backToLive]);

  // ---- one-time start: camera + detector (needs a user gesture on iOS) ----
  const start = useCallback(async () => {
    setError(null);
    setCamError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setCamError("insecure");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } },
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
    } catch (e) {
      const name = (e as DOMException)?.name;
      if (name === "NotAllowedError" || name === "SecurityError") setCamError("denied");
      else if (name === "NotFoundError" || name === "OverconstrainedError") setCamError("notfound");
      else setCamError("other");
      return;
    }
    setStarted(true);

    // Load the face detector lazily; if it fails, the kiosk still works via manual tap.
    try {
      const { FilesetResolver, FaceDetector } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks(`${BASE_PATH}/mediapipe/wasm`);
      detectorRef.current = await FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: `${BASE_PATH}/mediapipe/blaze_face_short_range.tflite` },
        runningMode: "VIDEO",
        minDetectionConfidence: 0.5,
      });
    } catch {
      // If MediaPipe fails, we still have the camera running; the user just won't
      // see alignment feedback. The server will still try to match on capture.
    }
  }, []);

  // ---- detection / countdown loop (runs once started, self-gates by phase) ----
  useEffect(() => {
    if (!started) return;
    let raf = 0;
    let cancelled = false;

    const setStatus = (state: RingState, hint: string, count: number) => {
      const key = `${state}|${hint}|${count}`;
      if (statusKeyRef.current === key) return;
      statusKeyRef.current = key;
      setRing({ state, hint, count });
    };

    const doCapture = () => {
      const video = videoRef.current;
      if (capturingRef.current || !video || !video.videoWidth) return;
      capturingRef.current = true;
      holdStartRef.current = 0;
      setPhase("matching");
      phaseRef.current = "matching";

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")?.drawImage(video, 0, 0); // raw (un-mirrored) frame for recognition
      canvas.toBlob(
        async (blob) => {
          if (!blob) {
            setError("Could not capture. Try again.");
            backToLive();
            return;
          }
          try {
            const fd = new FormData();
            fd.append("frame", blob, "frame.jpg");
            const res = await fetch(`${BASE_PATH}/api/checkin`, { method: "POST", body: fd });
            if (!res.ok) {
              const b = await res.json().catch(() => ({}));
              setError(b.error ?? "Check-in failed. Try again.");
              backToLive();
              return;
            }
            const b = (await res.json()) as { candidates: Candidate[] };
            const list = b.candidates ?? [];
            if (list.length === 0) {
              setError("No face matched. Please try again.");
              backToLive();
              return;
            }
            // Pick the confident (best) match, or the highest score if none is flagged.
            const bestMatch =
              list.find((c) => c.confident) ?? list.reduce((a, c) => (c.score > a.score ? c : a), list[0]);
            onMatchedRef.current(bestMatch);
          } catch {
            setError("Network error. Try again.");
            backToLive();
          }
        },
        "image/jpeg",
        0.92,
      );
    };
    captureRef.current = doCapture;

    const tick = () => {
      if (cancelled) return;
      raf = requestAnimationFrame(tick);
      const video = videoRef.current;
      const detector = detectorRef.current;
      if (phaseRef.current !== "live" || capturingRef.current) return;
      if (!video || video.readyState < 2 || !video.videoWidth || !detector) return;

      const now = performance.now();
      if (now - lastDetectRef.current < DETECT_INTERVAL_MS) return;
      lastDetectRef.current = now;

      let result;
      try {
        result = detector.detectForVideo(video, now);
      } catch {
        return;
      }
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      let best: { originX: number; originY: number; width: number; height: number } | null = null;
      let bestArea = 0;
      for (const d of result?.detections ?? []) {
        const bb = d.boundingBox;
        if (!bb) continue;
        const area = bb.width * bb.height;
        if (area > bestArea) {
          bestArea = area;
          best = bb;
        }
      }

      if (!best) {
        holdStartRef.current = 0;
        setStatus("search", "Position your face in the circle", 0);
        return;
      }

      const cx = (best.originX + best.width / 2) / vw;
      const cy = (best.originY + best.height / 2) / vh;
      const sizeH = best.height / vh;

      let aligned = false;
      let hint = "Center your face";
      if (sizeH < MIN_FACE) hint = "Come a little closer";
      else if (sizeH > MAX_FACE) hint = "Lean back a little";
      else if (Math.abs(cx - 0.5) > CENTER_TOL || Math.abs(cy - 0.5) > CENTER_TOL)
        hint = "Center your face";
      else aligned = true;

      if (aligned) {
        if (!holdStartRef.current) holdStartRef.current = now;
        const elapsed = now - holdStartRef.current;
        const count = Math.max(1, Math.ceil((HOLD_MS - elapsed) / 1000));
        setStatus("aligned", "Hold still…", count);
        if (elapsed >= HOLD_MS) doCapture();
      } else {
        holdStartRef.current = 0;
        setStatus("detect", hint, 0);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [started, backToLive]);

  // ---- teardown on unmount ----
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      detectorRef.current?.close?.();
      detectorRef.current = null;
    };
  }, []);

  // ---- camera error ----
  if (camError) {
    const messages: Record<NonNullable<CamError>, string> = {
      insecure: "Camera needs HTTPS or localhost.",
      denied: "Camera permission was denied. Allow it in the browser and reload.",
      notfound: "No camera found on this device.",
      other: "Could not start the camera.",
    };
    return (
      <div className="kiosk-stage kiosk-stage--plain">
        <div className="kiosk-card">
          <div className="notice notice--error">{messages[camError]}</div>
          <button className="btn btn--lg" onClick={start}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="kiosk-stage">
      <video ref={videoRef} className="kiosk-video" playsInline muted autoPlay />

      <Link href={homeHref} className="kiosk-home" aria-label="Home">
        <span className="kiosk-x" aria-hidden />
      </Link>

      {/* ---- start gate (one tap to grant camera + load detector) ---- */}
      {!started && (
        <div className="kiosk-overlay kiosk-overlay--center">
          <div className="kiosk-card">
            <h1>Check in</h1>
            <p className="subtitle">Tap to start, then line up your face in the circle.</p>
            <button className="btn btn--lg btn--block" onClick={start}>
              Start check-in
            </button>
          </div>
        </div>
      )}

      {/* ---- live: alignment ring + countdown ---- */}
      {started && phase === "live" && (
        <div className="kiosk-overlay">
          <div className={`face-ring face-ring--${ring.state}`}>
            {ring.state === "aligned" && <span className="kiosk-count">{ring.count}</span>}
          </div>
          <p className="kiosk-instruction">{ring.hint}</p>
          {error && <div className="notice notice--error kiosk-toast">{error}</div>}
        </div>
      )}

      {/* ---- matching ---- */}
      {phase === "matching" && (
        <div className="kiosk-overlay kiosk-overlay--center">
          <div className="kiosk-card" style={{ textAlign: "center" }}>
            <div className="spinner" aria-hidden />
            <h2>Matching…</h2>
          </div>
        </div>
      )}

      {/* ---- done ---- */}
      {phase === "done" && doneInfo && (
        <div className="kiosk-overlay kiosk-overlay--center">
          <div className="kiosk-card kiosk-card--ok" style={{ textAlign: "center" }}>
            <div className="kiosk-check" aria-hidden>
              <span className="kiosk-checkmark" />
            </div>
            <h1>Welcome, {doneInfo.name}!</h1>
            {doneInfo.full_company_name && (
              <p className="subtitle" style={{ fontSize: "1.25rem", fontWeight: 500 }}>
                {doneInfo.full_company_name}
              </p>
            )}
            <p className="muted">You&apos;re checked in.</p>
            <button className="btn btn--lg btn--block" onClick={backToLive}>
              Start again {resetCountdown > 0 && `(${resetCountdown})`}
            </button>
          </div>
        </div>
      )}

      {/* ---- already checked in ---- */}
      {phase === "already" && alreadyInfo && (
        <div className="kiosk-overlay kiosk-overlay--center">
          <div className="kiosk-card kiosk-card--warn" style={{ textAlign: "center" }}>
            <h1>{alreadyInfo.name}</h1>
            <p className="subtitle">
              Already checked in
              {alreadyInfo.checked_in_at
                ? ` · ${new Date(alreadyInfo.checked_in_at).toLocaleString()}`
                : ""}
            </p>
            <p className="muted" style={{ marginTop: 6 }}>
              Each guest can only check in once.
            </p>
            <button className="btn btn--lg btn--block" onClick={backToLive} style={{ marginTop: 12 }}>
              Next guest
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
