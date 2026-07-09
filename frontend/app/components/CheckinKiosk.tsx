"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { BASE_PATH } from "@/lib/basePath";
import { useAdminHome } from "./useAdminHome";
import useFaceAutoCapture from "./useFaceAutoCapture";
import FullscreenButton from "./FullscreenButton";

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
  const [phase, setPhase] = useState<
    "live" | "matching" | "done" | "already" | "nomatch"
  >("live");
  const [doneInfo, setDoneInfo] = useState<{
    name: string;
    full_company_name: string | null;
  } | null>(null);
  const [alreadyInfo, setAlreadyInfo] = useState<{
    name: string;
    full_company_name: string | null;
    checked_in_at: string;
  } | null>(null);
  // Failure shown as a full modal (no face matched / check-in error).
  const [failure, setFailure] = useState<{
    title: string;
    message: string;
  } | null>(null);
  const [resetCountdown, setResetCountdown] = useState(10);
  const resetCountdownRef = useRef(10);
  const homeHref = useAdminHome();
  const onMatchedRef = useRef<(candidate: Candidate) => void>(() => {});

  // Show the failure modal and start its auto-dismiss countdown.
  const enterFailure = useCallback((title: string, message: string) => {
    setFailure({ title, message });
    resetCountdownRef.current = 6;
    setResetCountdown(6);
    setPhase("nomatch");
  }, []);

  const onCapture = useCallback(
    async (blob: Blob) => {
      setPhase("matching");
      setFailure(null);
      try {
        const fd = new FormData();
        fd.append("frame", blob, "frame.jpg");
        const res = await fetch(`${BASE_PATH}/api/checkin`, {
          method: "POST",
          body: fd,
        });
        if (!res.ok) {
          const b = await res.json().catch(() => ({}));
          enterFailure("Check-in failed", b.error ?? "Please try again.");
          return;
        }
        const b = (await res.json()) as { candidates: Candidate[] };
        const list = b.candidates ?? [];
        if (list.length === 0) {
          enterFailure(
            "No face matched",
            "We couldn't recognise your face. Please face the camera and try again.",
          );
          return;
        }
        const bestMatch =
          list.find((c) => c.confident) ??
          list.reduce((a, c) => (c.score > a.score ? c : a), list[0]);
        onMatchedRef.current(bestMatch);
      } catch {
        enterFailure(
          "Network error",
          "Please check the connection and try again.",
        );
      }
    },
    [enterFailure],
  );

  const {
    videoRef,
    ring,
    camError,
    phase: capturePhase,
    start,
    resume,
  } = useFaceAutoCapture(onCapture);

  const backToLive = useCallback(() => {
    setDoneInfo(null);
    setAlreadyInfo(null);
    setFailure(null);
    resetCountdownRef.current = 10;
    setResetCountdown(10);
    // Re-arm the live scan on the same camera — no "Start check-in" gate again.
    resume();
    setPhase("live");
  }, [resume]);

  const onMatched = useCallback(
    async (candidate: Candidate) => {
      setFailure(null);
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
        enterFailure("Check-in failed", b.error ?? "Could not record your check-in.");
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
        return;
      }
      setDoneInfo({
        name: b.name ?? candidate.name,
        full_company_name: b.full_company_name ?? candidate.full_company_name,
      });
      setPhase("done");
      } catch {
        enterFailure("Network error", "Could not record your check-in.");
      }
    },
    [enterFailure],
  );

  useEffect(() => {
    onMatchedRef.current = onMatched;
  }, [onMatched]);

  // Auto-return to live detection after a result (success / already / no-match)
  // so the kiosk is ready for the next guest without needing a tap.
  useEffect(() => {
    if (phase !== "done" && phase !== "already" && phase !== "nomatch") return;
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
    <div
      className="kiosk-stage kiosk-stage--bg kiosk-stage--checkin"
      style={{ ["--kiosk-bg-url" as string]: `url("${BASE_PATH}/kelvin-bg.jpg")` }}
    >
      <div
        className="kiosk-bg-layer"
        style={{ ["--kiosk-bg-url" as string]: `url("${BASE_PATH}/kelvin-bg.jpg")` }}
        aria-hidden
      />
      <video
        ref={videoRef}
        className={`kiosk-video${capturePhase === "idle" ? " kiosk-video--idle" : ""}`}
        playsInline
        muted
        autoPlay
      />

      <Link href={homeHref} className="kiosk-home" aria-label="Home">
        <span className="kiosk-x" aria-hidden />
      </Link>
      <FullscreenButton className="kiosk-fs" />

      {/* ---- start gate (one tap to grant camera + load detector) ---- */}
      {capturePhase === "idle" && (
        <div className="kiosk-overlay kiosk-overlay--center kiosk-overlay--bottom">
          <div className="kiosk-card">
            <h1>Check in</h1>
            <p className="subtitle">
              Tap to start, then line up your face in the circle.
            </p>
            <button className="btn btn--lg btn--block" onClick={start}>
              Start check-in
            </button>
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
      {phase === "matching" && (
        <div className="kiosk-overlay kiosk-overlay--center">
          <div className="kiosk-card" style={{ textAlign: "center" }}>
            <div className="spinner" aria-hidden />
            <h2>Matching…</h2>
          </div>
        </div>
      )}

      {/* ---- no match / failure modal ---- */}
      {phase === "nomatch" && failure && (
        <div className="kiosk-overlay kiosk-overlay--center">
          <div
            className="kiosk-card kiosk-card--err"
            style={{ textAlign: "center" }}
          >
            <div className="kiosk-cross" aria-hidden>
              <span className="kiosk-cross-mark" />
            </div>
            <h1>{failure.title}</h1>
            <p className="subtitle">{failure.message}</p>
            <div className="kiosk-success-actions">
              <button className="btn btn--lg btn--block" onClick={backToLive}>
                Try again {resetCountdown > 0 && `(${resetCountdown})`}
              </button>
            </div>
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
