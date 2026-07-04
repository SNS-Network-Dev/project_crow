"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { BASE_PATH } from "@/lib/basePath";
import { useAdminHome } from "./useAdminHome";
import useFaceAutoCapture from "./useFaceAutoCapture";
import { useToast } from "./ToastProvider";

// One unified, responsive check-in surface for BOTH phone (/admin/checkin) and
// the iPad kiosk (/kiosk). It fills the screen, uses the shared useFaceAutoCapture
// hook for the alignment ring + auto-capture, then runs the recognition flow
// (/api/checkin -> /api/confirm). Recognition itself stays on the GPU.

interface Candidate {
  person_id: number;
  name: string;
  full_company_name: string | null;
  photo_url: string | null;
  score: number;
  confident: boolean;
}

export default function CheckinKiosk() {
  const toast = useToast();
  const [phase, setPhase] = useState<"live" | "matching" | "done" | "already">(
    "live",
  );
  const [doneInfo, setDoneInfo] = useState<{
    name: string;
    full_company_name: string | null;
  } | null>(null);
  const [alreadyInfo, setAlreadyInfo] = useState<{
    name: string;
    full_company_name: string | null;
    checked_in_at: string;
  } | null>(null);
  const [resetCountdown, setResetCountdown] = useState(10);
  const resetCountdownRef = useRef(10);
  const homeHref = useAdminHome();
  const onMatchedRef = useRef<(candidate: Candidate) => void>(() => {});
  const backToLiveRef = useRef<() => void>(() => {});

  const onCapture = useCallback(async (blob: Blob) => {
    setPhase("matching");
    try {
      const fd = new FormData();
      fd.append("frame", blob, "frame.jpg");
      const res = await fetch(`${BASE_PATH}/api/checkin`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        toast.show(b.error ?? "Check-in failed. Try again.", "error");
        backToLiveRef.current();
        return;
      }
      const b = (await res.json()) as { candidates: Candidate[] };
      const list = b.candidates ?? [];
      if (list.length === 0) {
        toast.show("No face matched. Please try again.", "error");
        backToLiveRef.current();
        return;
      }
      const bestMatch =
        list.find((c) => c.confident) ??
        list.reduce((a, c) => (c.score > a.score ? c : a), list[0]);
      onMatchedRef.current(bestMatch);
    } catch {
      toast.show("Network error. Try again.", "error");
      backToLiveRef.current();
    }
  }, [toast]);

  const {
    videoRef,
    ring,
    camError,
    phase: capturePhase,
    start,
    stop,
    resetRing,
  } = useFaceAutoCapture(onCapture);

  const backToLive = useCallback(() => {
    setDoneInfo(null);
    setAlreadyInfo(null);
    resetCountdownRef.current = 10;
    setResetCountdown(10);
    resetRing();
    setPhase("live");
  }, [resetRing]);

  const onMatched = useCallback(async (candidate: Candidate) => {
    try {
      const res = await fetch(`${BASE_PATH}/api/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          person_id: candidate.person_id,
          score: candidate.score,
        }),
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
        toast.show(b.error ?? "Could not record check-in.", "error");
        return;
      }
      if (b.alreadyCheckedIn) {
        setAlreadyInfo({
          name: b.name ?? candidate.name,
          full_company_name: b.full_company_name ?? candidate.full_company_name,
          checked_in_at: b.checked_in_at ?? "",
        });
        setPhase("already");
        resetCountdownRef.current = 10;
        setResetCountdown(10);
        toast.show(`${b.name ?? candidate.name} is already checked in.`, "info");
        return;
      }
      setDoneInfo({
        name: b.name ?? candidate.name,
        full_company_name: b.full_company_name ?? candidate.full_company_name,
      });
      setPhase("done");
      toast.show(`${b.name ?? candidate.name} checked in.`, "ok");
    } catch {
      toast.show("Network error recording check-in.", "error");
    }
  }, [toast]);

  useEffect(() => {
    onMatchedRef.current = onMatched;
  }, [onMatched]);

  useEffect(() => {
    backToLiveRef.current = backToLive;
  }, [backToLive]);

  // Start the camera straight away when the component mounts. On a fresh load
  // the browser asks for permission once; after permission is granted it just works.
  useEffect(() => {
    const id = window.setTimeout(() => start(), 0);
    return () => window.clearTimeout(id);
  }, [start]);

  // 10-second countdown on the success / already-checked-in screens;
  // auto-returns to live detection so the kiosk is ready for the next guest.
  useEffect(() => {
    if (phase !== "done" && phase !== "already") return;
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

  // Camera error screen.
  if (camError) {
    const messages: Record<typeof camError & string, string> = {
      insecure: "Camera needs HTTPS or localhost.",
      denied:
        "Camera permission was denied. Allow it in the browser and reload.",
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
      <video
        ref={videoRef}
        className="kiosk-video"
        playsInline
        muted
        autoPlay
      />

      <Link href={homeHref} className="kiosk-home" aria-label="Home">
        <span className="kiosk-x" aria-hidden />
      </Link>

      {/* ---- camera starting / permission prompt (no extra tap needed) ---- */}
      {capturePhase === "idle" && (
        <div className="kiosk-overlay kiosk-overlay--center">
          <div className="kiosk-card" style={{ textAlign: "center" }}>
            <div className="spinner" aria-hidden />
            <h2>Starting camera…</h2>
            <p className="subtitle">Allow camera access if prompted.</p>
          </div>
        </div>
      )}

      {/* ---- live: alignment ring + countdown ---- */}
      {capturePhase === "live" && phase === "live" && (
        <div className="kiosk-overlay">
          <div className={`face-ring face-ring--${ring.state}`}>
            {ring.state === "aligned" && (
              <span className="kiosk-count">{ring.count}</span>
            )}
          </div>
          <p className="kiosk-instruction">{ring.hint}</p>
        </div>
      )}

      {/* ---- matching ---- */}
      {(phase === "matching" || capturePhase === "captured") && (
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
          <div
            className="kiosk-card kiosk-card--ok"
            style={{ textAlign: "center" }}
          >
            <div className="kiosk-check" aria-hidden>
              <span className="kiosk-checkmark" />
            </div>
            <h1>Welcome, {doneInfo.name}!</h1>
            {doneInfo.full_company_name && (
              <p
                className="subtitle"
                style={{ fontSize: "1.25rem", fontWeight: 500 }}
              >
                {doneInfo.full_company_name}
              </p>
            )}
            <p className="muted">You&apos;re checked in.</p>
            <div className="kiosk-success-actions">
              <button className="btn btn--lg btn--block" onClick={backToLive}>
                Start again {resetCountdown > 0 && `(${resetCountdown})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- already checked in ---- */}
      {phase === "already" && alreadyInfo && (
        <div className="kiosk-overlay kiosk-overlay--center">
          <div
            className="kiosk-card kiosk-card--ok"
            style={{ textAlign: "center" }}
          >
            <div className="kiosk-check" aria-hidden>
              <span className="kiosk-checkmark" />
            </div>
            <h1>Welcome, {alreadyInfo.name}!</h1>
            {alreadyInfo.full_company_name && (
              <p
                className="subtitle"
                style={{ fontSize: "1.25rem", fontWeight: 500 }}
              >
                {alreadyInfo.full_company_name}
              </p>
            )}
            <p className="muted">
              You&apos;re already checked in
              {alreadyInfo.checked_in_at
                ? ` · ${new Date(alreadyInfo.checked_in_at).toLocaleString(
                    "en-US",
                    {
                      year: "numeric",
                      month: "numeric",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    },
                  )}`
                : ""}
            </p>
            <div className="kiosk-success-actions">
              <button className="btn btn--lg btn--block" onClick={backToLive}>
                Start again {resetCountdown > 0 && `(${resetCountdown})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
