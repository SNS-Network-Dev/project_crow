"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FaceDetector as MPFaceDetector } from "@mediapipe/tasks-vision";
import { BASE_PATH } from "@/lib/basePath";

// Shared MediaPipe BlazeFace auto-capture logic for check-in and registration.
// Handles camera permission, video playback, face alignment, and auto-capture
// once the face is centered and held still. Returns a ref to attach to a
// <video> element plus status helpers.

type CamError = "insecure" | "denied" | "notfound" | "other" | null;
type RingState = "search" | "detect" | "aligned";
export type FaceCapturePhase = "idle" | "live" | "captured";

const CENTER_TOL = 0.17;
const MIN_FACE = 0.2;
const MAX_FACE = 0.72;
const HOLD_MS = 2500;
const DETECT_INTERVAL_MS = 90;

export interface FaceRing {
  state: RingState;
  hint: string;
  count: number;
}

export default function useFaceAutoCapture(onCapture: (blob: Blob) => void) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<MPFaceDetector | null>(null);
  const capturingRef = useRef(false);
  const holdStartRef = useRef(0);
  const lastDetectRef = useRef(0);
  const statusKeyRef = useRef("");

  const [phase, setPhase] = useState<FaceCapturePhase>("idle");
  const [camError, setCamError] = useState<CamError>(null);
  const [ring, setRing] = useState<FaceRing>({
    state: "search",
    hint: "Position your face in the circle",
    count: 0,
  });

  const resetRing = useCallback(() => {
    holdStartRef.current = 0;
    statusKeyRef.current = "";
    setRing({
      state: "search",
      hint: "Position your face in the circle",
      count: 0,
    });
  }, []);

  const stop = useCallback(() => {
    capturingRef.current = false;
    holdStartRef.current = 0;
    statusKeyRef.current = "";
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    detectorRef.current?.close?.();
    detectorRef.current = null;
    setPhase("idle");
  }, []);

  const start = useCallback(async () => {
    setCamError(null);
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setCamError("insecure");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 960 },
        },
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
      let err: CamError = "other";
      if (name === "NotAllowedError" || name === "SecurityError")
        err = "denied";
      else if (name === "NotFoundError" || name === "OverconstrainedError")
        err = "notfound";
      setCamError(err);
      return;
    }

    setPhase("live");

    try {
      const { FilesetResolver, FaceDetector } =
        await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks(
        `${BASE_PATH}/mediapipe/wasm`,
      );
      detectorRef.current = await FaceDetector.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: `${BASE_PATH}/mediapipe/blaze_face_short_range.tflite`,
        },
        runningMode: "VIDEO",
        minDetectionConfidence: 0.5,
      });
    } catch {
      // Detector failure still leaves the camera running; the host surface can
      // offer a manual capture fallback if it wants.
    }
  }, []);

  const doCapture = useCallback(() => {
    const video = videoRef.current;
    if (capturingRef.current || !video || !video.videoWidth) return;
    capturingRef.current = true;
    holdStartRef.current = 0;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob(
      (b) => {
        if (b) {
          onCapture(b);
          setPhase("captured");
        }
        // If toBlob fails, the host surface should surface its own error.
      },
      "image/jpeg",
      0.92,
    );
  }, [onCapture]);

  // Detection / countdown loop.
  useEffect(() => {
    if (phase !== "live") return;
    let raf = 0;
    let cancelled = false;

    const setStatus = (state: RingState, hint: string, count: number) => {
      const key = `${state}|${hint}|${count}`;
      if (statusKeyRef.current === key) return;
      statusKeyRef.current = key;
      setRing({ state, hint, count });
    };

    const tick = () => {
      if (cancelled) return;
      raf = requestAnimationFrame(tick);
      const video = videoRef.current;
      const detector = detectorRef.current;
      if (!video || video.readyState < 2 || !video.videoWidth || !detector)
        return;

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
      let best: {
        originX: number;
        originY: number;
        width: number;
        height: number;
      } | null = null;
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
      else if (
        Math.abs(cx - 0.5) > CENTER_TOL ||
        Math.abs(cy - 0.5) > CENTER_TOL
      )
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
  }, [phase, doCapture]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      detectorRef.current?.close?.();
      detectorRef.current = null;
    };
  }, []);

  return {
    videoRef,
    ring,
    camError,
    phase,
    start,
    stop,
    resetRing,
  };
}
