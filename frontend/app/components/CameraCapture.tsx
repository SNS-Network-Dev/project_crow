"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BASE_PATH } from "@/lib/basePath";

export interface Candidate {
  person_id: number;
  name: string;
  photo_url: string | null;
  score: number;
  confident: boolean;
}

interface Person {
  id: number;
  name: string;
  email: string | null;
  photo_url: string | null;
}

type CamError = "insecure" | "denied" | "notfound" | "other" | null;

export default function CameraCapture({
  facingMode = "user",
  variant = "phone",
}: {
  facingMode?: "user" | "environment";
  variant?: "phone" | "kiosk";
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [camError, setCamError] = useState<CamError>(null);
  const [busy, setBusy] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [manual, setManual] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [filter, setFilter] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startCamera = useCallback(async () => {
    setCamError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      // Happens on insecure origins (plain http over LAN) — getUserMedia is undefined.
      setCamError("insecure");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode } });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        const tryPlay = () => video.play().catch(() => {});
        // Play now if metadata is ready, and again once it loads (covers both orderings).
        if (video.readyState >= 1) tryPlay();
        video.onloadedmetadata = tryPlay;
      }
    } catch (e) {
      const name = (e as DOMException)?.name;
      if (name === "NotAllowedError" || name === "SecurityError") setCamError("denied");
      else if (name === "NotFoundError" || name === "OverconstrainedError") setCamError("notfound");
      else setCamError("other");
    }
  }, [facingMode]);

  useEffect(() => {
    startCamera();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [startCamera]);

  const grabFrame = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const video = videoRef.current;
      if (!video || !video.videoWidth) return resolve(null);
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(null);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.9);
    });
  }, []);

  const doCheckin = useCallback(async () => {
    setError(null);
    setDone(null);
    setCandidates(null);
    setManual(false);
    setBusy(true);
    try {
      const frame = await grabFrame();
      if (!frame) {
        setError("Could not capture from the camera. Try again.");
        return;
      }
      const fd = new FormData();
      fd.append("frame", frame, "frame.jpg");
      const res = await fetch(`${BASE_PATH}/api/checkin`, { method: "POST", body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Check-in failed. Try again.");
        return;
      }
      const body = (await res.json()) as { candidates: Candidate[] };
      setCandidates(body.candidates);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }, [grabFrame]);

  const confirm = useCallback(async (personId: number, score: number, name: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${BASE_PATH}/api/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ person_id: personId, score }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Could not record check-in.");
        return;
      }
      setDone(name);
      setCandidates(null);
      setManual(false);
    } catch {
      setError("Network error recording check-in.");
    } finally {
      setBusy(false);
    }
  }, []);

  const openManual = useCallback(async () => {
    setManual(true);
    setCandidates(null);
    setFilter("");
    try {
      const res = await fetch(`${BASE_PATH}/api/people`);
      const body = (await res.json()) as { people: Person[] };
      setPeople(body.people ?? []);
    } catch {
      setError("Could not load the people list.");
    }
  }, []);

  const reset = useCallback(() => {
    setDone(null);
    setError(null);
    setCandidates(null);
    setManual(false);
  }, []);

  // ---- success screen ----
  if (done) {
    return (
      <div className="panel" style={{ textAlign: "center" }}>
        <div className="notice notice--ok" style={{ fontSize: "1.2rem" }}>
          ✅ Checked in: <strong>{done}</strong>
        </div>
        <button className="btn btn--lg btn--block" onClick={reset}>
          Check in someone else
        </button>
      </div>
    );
  }

  // ---- camera error screen ----
  if (camError) {
    const messages: Record<NonNullable<CamError>, string> = {
      insecure:
        "Camera blocked: this page must be served over HTTPS or localhost. Plain http://<lan-ip> will not grant camera access.",
      denied: "Camera permission was denied. Allow camera access in your browser and reload.",
      notfound: "No camera found on this device.",
      other: "Could not start the camera.",
    };
    return (
      <div className="panel">
        <div className="notice notice--error">{messages[camError]}</div>
        <div className="row">
          <button className="btn" onClick={startCamera}>
            Retry camera
          </button>
          <button className="btn btn--ghost" onClick={openManual}>
            Manual entry instead
          </button>
        </div>
        {manual && (
          <ManualPicker
            people={people}
            filter={filter}
            setFilter={setFilter}
            onPick={(p) => confirm(p.id, 0, p.name)}
            busy={busy}
          />
        )}
      </div>
    );
  }

  return (
    <div className={variant === "kiosk" ? "kiosk" : undefined}>
      <div className="video-shell">
        <video ref={videoRef} playsInline muted autoPlay />
      </div>

      {error && <div className="notice notice--error">{error}</div>}

      {!candidates && !manual && (
        <button
          className="btn btn--lg btn--block"
          onClick={doCheckin}
          disabled={busy}
          style={{ marginTop: 14 }}
        >
          {busy ? "Matching…" : "Capture & check in"}
        </button>
      )}

      {candidates && (
        <div style={{ marginTop: 14 }}>
          {candidates.length === 0 ? (
            <div className="notice notice--error">
              No face detected (or no close match). Move into frame and retry, or pick yourself.
            </div>
          ) : (
            <>
              <p className="subtitle" style={{ marginTop: 8 }}>
                Tap your name to check in:
              </p>
              <div className="candidates">
                {candidates.map((c) => (
                  <button
                    key={c.person_id}
                    className={`candidate ${c.confident ? "candidate--confident" : ""}`}
                    onClick={() => confirm(c.person_id, c.score, c.name)}
                    disabled={busy}
                  >
                    {c.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.photo_url} alt={c.name} />
                    ) : (
                      <span className="avatar">👤</span>
                    )}
                    <span className="meta">
                      <span className="name">{c.name}</span>
                      <span className="score"> match {(c.score * 100).toFixed(0)}%</span>
                    </span>
                    {c.confident && <span className="badge">BEST</span>}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn btn--ghost" onClick={doCheckin} disabled={busy}>
              Retry capture
            </button>
            <button className="btn btn--ghost" onClick={openManual} disabled={busy}>
              None of these / manual entry
            </button>
          </div>
        </div>
      )}

      {manual && (
        <ManualPicker
          people={people}
          filter={filter}
          setFilter={setFilter}
          onPick={(p) => confirm(p.id, 0, p.name)}
          busy={busy}
        />
      )}
    </div>
  );
}

function ManualPicker({
  people,
  filter,
  setFilter,
  onPick,
  busy,
}: {
  people: Person[];
  filter: string;
  setFilter: (s: string) => void;
  onPick: (p: Person) => void;
  busy: boolean;
}) {
  const f = filter.trim().toLowerCase();
  const shown = f
    ? people.filter((p) => p.name.toLowerCase().includes(f) || (p.email ?? "").toLowerCase().includes(f))
    : people;
  return (
    <div style={{ marginTop: 16 }}>
      <input
        className="search"
        type="text"
        placeholder="Search your name…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        autoFocus
      />
      <div className="candidates">
        {shown.slice(0, 50).map((p) => (
          <button key={p.id} className="candidate" onClick={() => onPick(p)} disabled={busy}>
            {p.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.photo_url} alt={p.name} />
            ) : (
              <span className="avatar">👤</span>
            )}
            <span className="meta">
              <span className="name">{p.name}</span>
              {p.email && <span className="score"> {p.email}</span>}
            </span>
          </button>
        ))}
        {shown.length === 0 && <p className="muted">No matching people.</p>}
      </div>
    </div>
  );
}
