"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { BASE_PATH } from "@/lib/basePath";
import { useAdminHome } from "./useAdminHome";
import FullscreenButton from "./FullscreenButton";

// Full-screen QR check-in kiosk. A USB QR scanner in keyboard-wedge mode "types"
// the scanned payload followed by Enter, so we capture keystrokes globally and
// submit on Enter — no camera, no focus juggling. A guest can also key a code in
// by hand as a fallback. Visuals mirror CheckinKiosk (kiosk-stage / kiosk-card).

type Phase = "scan" | "matching" | "done" | "already";

interface DoneInfo {
  name: string;
  full_company_name: string | null;
  checked_in_at?: string;
}

const AUTO_RESET_SECS = 6;

// A scanned QR may encode a bare code or a URL wrapping it. Pull the code out of
// a URL (?code=… or the last path segment); otherwise use the raw text.
function normalizeScan(raw: string): string {
  const s = raw.trim();
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      return (
        u.searchParams.get("code") ||
        u.pathname.split("/").filter(Boolean).pop() ||
        s
      ).trim();
    } catch {
      /* not a valid URL — fall through */
    }
  }
  return s;
}

export default function QrCheckinKiosk() {
  const [phase, setPhase] = useState<Phase>("scan");
  const [doneInfo, setDoneInfo] = useState<DoneInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetCountdown, setResetCountdown] = useState(AUTO_RESET_SECS);
  const [manual, setManual] = useState("");
  const homeHref = useAdminHome();

  const bufferRef = useRef("");
  const lastKeyRef = useRef(0);
  const busyRef = useRef(false); // a request is in flight — ignore new keystrokes
  const manualFocusedRef = useRef(false); // don't double-capture into the buffer
  const submitRef = useRef<(code: string) => void>(() => {});

  const submit = useCallback(async (raw: string) => {
    const code = normalizeScan(raw);
    if (!code || busyRef.current) return;
    busyRef.current = true;
    setManual("");
    setError(null);
    setPhase("matching");
    try {
      const res = await fetch(`${BASE_PATH}/api/checkin/qr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
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
        setError(b.error ?? "Check-in failed. Try again.");
        setPhase("scan");
        return;
      }
      setDoneInfo({
        name: b.name ?? "Guest",
        full_company_name: b.full_company_name ?? null,
        checked_in_at: b.checked_in_at,
      });
      setPhase(b.alreadyCheckedIn ? "already" : "done");
      setResetCountdown(AUTO_RESET_SECS);
    } catch {
      setError("Network error. Try again.");
      setPhase("scan");
    } finally {
      busyRef.current = false;
    }
  }, []);

  useEffect(() => {
    submitRef.current = submit;
  }, [submit]);

  // Global keyboard-wedge capture. Scanners burst characters fast then send
  // Enter; a long gap between keys resets the buffer so stray keystrokes don't
  // accumulate. Stays active on the result screens so the next scan advances.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (manualFocusedRef.current || busyRef.current) return;
      if (e.key === "Enter") {
        const code = bufferRef.current;
        bufferRef.current = "";
        if (code) {
          e.preventDefault();
          submitRef.current(code);
        }
        return;
      }
      const now = Date.now();
      if (now - lastKeyRef.current > 500) bufferRef.current = "";
      lastKeyRef.current = now;
      if (e.key.length === 1) bufferRef.current += e.key;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const backToScan = useCallback(() => {
    setDoneInfo(null);
    setError(null);
    setManual("");
    bufferRef.current = "";
    setPhase("scan");
  }, []);

  // Auto-return to scanning after a result so the kiosk is ready for the next
  // guest (a scan also advances immediately via the global listener).
  useEffect(() => {
    if (phase !== "done" && phase !== "already") return;
    let remaining = AUTO_RESET_SECS;
    setResetCountdown(remaining);
    const id = window.setInterval(() => {
      remaining -= 1;
      setResetCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(id);
        backToScan();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [phase, backToScan]);

  return (
    <div
      className="kiosk-stage kiosk-stage--plain kiosk-stage--bg"
      style={{ ["--kiosk-bg-url" as string]: `url("${BASE_PATH}/kelvin-bg.jpg")` }}
    >
      <Link href={homeHref} className="kiosk-home" aria-label="Home">
        <span className="kiosk-x" aria-hidden />
      </Link>
      <FullscreenButton className="kiosk-fs" />

      {/* ---- waiting for a scan ---- */}
      {phase === "scan" && (
        <div className="kiosk-overlay kiosk-overlay--center kiosk-overlay--bottom">
          <div className="kiosk-card" style={{ textAlign: "center" }}>
            <div className="qr-scan-icon" aria-hidden>
              <svg viewBox="0 0 24 24" width="72" height="72" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <path d="M14 14h3v3h-3z" />
                <path d="M20 14v3" />
                <path d="M14 20h3" />
                <path d="M20 20h1" />
              </svg>
              <span className="qr-scan-beam" aria-hidden />
            </div>
            <h1>Scan your QR code</h1>
            <p className="subtitle">
              Hold your invitation QR up to the scanner to check in.
            </p>
            {error && (
              <div className="notice notice--error" style={{ marginTop: 14 }}>
                {error}
              </div>
            )}
            <form
              className="qr-manual"
              onSubmit={(e) => {
                e.preventDefault();
                submit(manual);
              }}
            >
              <input
                className="qr-manual-input"
                value={manual}
                onChange={(e) => {
                  const v = e.target.value;
                  setManual(v);
                  // Auto-submit once a full 8-char code is entered — no button
                  // needed. A scanner that appends Enter (or a wrapped URL
                  // payload) still submits via the form's onSubmit above.
                  if (/^[A-Za-z0-9]{8}$/.test(v.trim())) submit(v);
                }}
                onFocus={() => {
                  manualFocusedRef.current = true;
                }}
                onBlur={() => {
                  manualFocusedRef.current = false;
                }}
                placeholder="or enter code manually"
                aria-label="QR code"
                autoComplete="off"
                spellCheck={false}
              />
            </form>
          </div>
        </div>
      )}

      {/* ---- looking up ---- */}
      {phase === "matching" && (
        <div className="kiosk-overlay kiosk-overlay--center">
          <div className="kiosk-card" style={{ textAlign: "center" }}>
            <div className="spinner" aria-hidden />
            <h2>Checking in…</h2>
          </div>
        </div>
      )}

      {/* ---- checked in ---- */}
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
            <div className="kiosk-success-actions">
              <button className="btn btn--lg btn--block" onClick={backToScan}>
                Scan next {resetCountdown > 0 && `(${resetCountdown})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- already checked in ---- */}
      {phase === "already" && doneInfo && (
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
            <p className="muted">
              You&apos;re already checked in
              {doneInfo.checked_in_at
                ? ` · ${new Date(doneInfo.checked_in_at).toLocaleString("en-US", {
                    year: "numeric",
                    month: "numeric",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}`
                : ""}
            </p>
            <div className="kiosk-success-actions">
              <button className="btn btn--lg btn--block" onClick={backToScan}>
                Scan next {resetCountdown > 0 && `(${resetCountdown})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
