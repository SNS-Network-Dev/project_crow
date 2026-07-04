"use client";

import { useCallback, useEffect, useState } from "react";
import { BASE_PATH } from "@/lib/basePath";
import { useToast } from "../components/ToastProvider";
import FaceCapture from "../components/FaceCapture";
import CountdownTimer from "../components/CountdownTimer";

interface FoundPerson {
  id: number;
  name: string;
  contactNumber: string | null;
  companyEmail: string | null;
  fullCompanyName: string | null;
  designation: string | null;
  invitedBy: string | null;
  remarks: string | null;
  photoUrl: string | null;
  hasEmbedding: boolean;
}

type CheckinStep =
  | "lookup"
  | "confirm"
  | "choose"
  | "matching"
  | "done"
  | "already";

interface DoneInfo {
  name: string;
  fullCompanyName: string | null;
  checkedInAt?: string;
  method: "face" | "manual";
}

const DASH = "—";

export default function EarlyCheckinPage() {
  const toast = useToast();
  const [step, setStep] = useState<CheckinStep>("lookup");
  const [countdownEnabled, setCountdownEnabled] = useState(false);
  const [countdownTarget, setCountdownTarget] = useState(
    new Date().toISOString(),
  );
  const [eventName, setEventName] = useState("the event");
  const [name, setName] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
  const [person, setPerson] = useState<FoundPerson | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [doneInfo, setDoneInfo] = useState<DoneInfo | null>(null);

  useEffect(() => {
    fetch(`${BASE_PATH}/api/settings`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (typeof data.earlyCheckinCountdownEnabled === "boolean") {
          setCountdownEnabled(data.earlyCheckinCountdownEnabled);
        }
        if (typeof data.earlyCheckinTargetIso === "string") {
          setCountdownTarget(data.earlyCheckinTargetIso);
        }
        if (typeof data.eventName === "string") {
          setEventName(data.eventName);
        }
      })
      .catch(() => {
        /* ignore; defaults are safe */
      });
  }, []);

  const resetAll = useCallback(() => {
    setStep("lookup");
    setName("");
    setCompanyEmail("");
    setPerson(null);
    setCameraOpen(false);
    setBusy(false);
    setDoneInfo(null);
  }, []);

  const lookup = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch(`${BASE_PATH}/api/register/lookup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          companyEmail: companyEmail.trim(),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.show(body.error ?? "Lookup failed.", "error");
        return;
      }
      setPerson({
        ...body,
        photoUrl: body.photoUrl ?? null,
        hasEmbedding: body.hasEmbedding ?? false,
      });
      setStep("confirm");
    } catch {
      toast.show("Network error. Try again.", "error");
    } finally {
      setBusy(false);
    }
  }, [name, companyEmail, toast]);

  const recordManualCheckin = useCallback(async () => {
    if (!person) return;
    setBusy(true);
    try {
      const res = await fetch(`${BASE_PATH}/api/early-checkin/manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ person_id: person.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.show(body.error ?? "Check-in failed.", "error");
        setBusy(false);
        return;
      }
      if (body.alreadyCheckedIn) {
        setDoneInfo({
          name: body.name,
          fullCompanyName: body.full_company_name ?? null,
          checkedInAt: body.checked_in_at,
          method: "manual",
        });
        setStep("already");
        toast.show(`${body.name} is already checked in.`, "info");
      } else {
        setDoneInfo({
          name: body.name,
          fullCompanyName: body.full_company_name ?? null,
          checkedInAt: body.checked_in_at,
          method: "manual",
        });
        setStep("done");
        toast.show(`${body.name} checked in.`, "ok");
      }
    } catch {
      toast.show("Network error. Try again.", "error");
    } finally {
      setBusy(false);
    }
  }, [person, toast]);

  const handleFaceCapture = useCallback(
    async (blob: Blob) => {
      if (!person) return;
      setCameraOpen(false);
      setBusy(true);
      setStep("matching");
      try {
        const fd = new FormData();
        fd.append("frame", blob, "frame.jpg");
        const res = await fetch(`${BASE_PATH}/api/checkin`, {
          method: "POST",
          body: fd,
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.show(body.error ?? "Face check-in failed.", "error");
          setStep("choose");
          setBusy(false);
          return;
        }
        const candidates: {
          person_id: number;
          score: number;
          confident: boolean;
        }[] = body.candidates ?? [];
        const match = candidates.find(
          (c) => c.confident && c.person_id === person.id,
        );
        if (!match) {
          toast.show(
            "We couldn't verify your face. Please try again or check in manually.",
            "error",
          );
          setStep("choose");
          setBusy(false);
          return;
        }

        const confirmRes = await fetch(`${BASE_PATH}/api/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            person_id: person.id,
            score: match.score,
          }),
        });
        const confirmBody = await confirmRes.json().catch(() => ({}));
        if (!confirmRes.ok) {
          toast.show(confirmBody.error ?? "Could not record check-in.", "error");
          setStep("choose");
          setBusy(false);
          return;
        }
        if (confirmBody.alreadyCheckedIn) {
          setDoneInfo({
            name: confirmBody.name ?? person.name,
            fullCompanyName: confirmBody.full_company_name ?? person.fullCompanyName,
            checkedInAt: confirmBody.checked_in_at,
            method: "face",
          });
          setStep("already");
          toast.show(
            `${confirmBody.name ?? person.name} is already checked in.`,
            "info",
          );
        } else {
          setDoneInfo({
            name: confirmBody.name ?? person.name,
            fullCompanyName: confirmBody.full_company_name ?? person.fullCompanyName,
            checkedInAt: confirmBody.checked_in_at,
            method: "face",
          });
          setStep("done");
          toast.show(`${confirmBody.name ?? person.name} checked in.`, "ok");
        }
      } catch {
        toast.show("Network error. Try again.", "error");
        setStep("choose");
      } finally {
        setBusy(false);
      }
    },
    [person, toast],
  );

  const eventOpen = !countdownEnabled || Date.now() >= new Date(countdownTarget).getTime();

  return (
    <main className="wrap">
      <div className="panel register-card">
        {step === "lookup" && (
          <h1 className="register-title register-title--in-card">
            Early check-in
          </h1>
        )}

        {step === "lookup" && !eventOpen && (
          <CountdownTimer
            targetIso={countdownTarget}
            enabled={countdownEnabled}
            eventName={eventName}
          />
        )}

        {step === "lookup" && eventOpen && (
          <>
            <p className="subtitle" style={{ textAlign: "center", marginBottom: 24 }}>
              Enter your details to find your invitation.
            </p>
            <div className="register-field">
              <label htmlFor="ci-name">Full Name</label>
              <input
                id="ci-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. John Doe"
              />
            </div>
            <div className="register-field">
              <label htmlFor="ci-email">Company Email</label>
              <input
                id="ci-email"
                type="email"
                value={companyEmail}
                onChange={(e) => setCompanyEmail(e.target.value)}
                placeholder="e.g. john@snsnetwork.my"
              />
            </div>
            <button
              className="register-btn register-btn--primary register-btn--block"
              onClick={lookup}
              disabled={busy || !name.trim() || !companyEmail.trim()}
            >
              {busy ? "Looking up…" : "Check in"}
            </button>
          </>
        )}

        {step === "confirm" && person && (
          <>
            <h2 className="register-step-heading">Is this you?</h2>
            <div className="register-confirm-card">
              <dl>
                <dt>Full Name</dt>
                <dd>{person.name}</dd>
                <dt>Contact Number</dt>
                <dd>{person.contactNumber ?? DASH}</dd>
                <dt>Company Email</dt>
                <dd>{person.companyEmail ?? DASH}</dd>
                <dt>Full Company Name</dt>
                <dd>{person.fullCompanyName ?? DASH}</dd>
                <dt>Designation</dt>
                <dd>{person.designation ?? DASH}</dd>
              </dl>
            </div>
            <div className="register-actions">
              <button
                className="register-btn register-btn--primary register-btn--block"
                onClick={() => setStep("choose")}
              >
                Yes, continue
              </button>
              <button
                className="register-btn register-btn--ghost register-btn--block"
                onClick={resetAll}
              >
                No, start over
              </button>
            </div>
          </>
        )}

        {step === "choose" && person && (
          <>
            <h2 className="register-step-heading">Choose check-in method</h2>
            {person.hasEmbedding ? (
              <div className="register-method-option">
                <div className="register-method-icon">😊</div>
                <div className="register-method-body">
                  <strong>Face check-in</strong>
                  <p>Fast and contactless. Line up your face on the next screen.</p>
                </div>
              </div>
            ) : (
              <div className="register-method-option register-method-option--muted">
                <div className="register-method-icon">🚫</div>
                <div className="register-method-body">
                  <strong>Face check-in not available</strong>
                  <p>You haven&apos;t registered a face yet.</p>
                </div>
              </div>
            )}
            <div className="register-actions">
              <button
                className="register-btn register-btn--primary register-btn--block"
                onClick={() => setCameraOpen(true)}
                disabled={!person.hasEmbedding || busy}
              >
                Check in with face
              </button>
              <button
                className="register-btn register-btn--ghost register-btn--block"
                onClick={recordManualCheckin}
                disabled={busy}
              >
                Check in manually
              </button>
            </div>
            <FaceCapture
              open={cameraOpen}
              onClose={() => setCameraOpen(false)}
              onCapture={handleFaceCapture}
              onError={(msg) => toast.show(msg, "error")}
            />
          </>
        )}

        {step === "matching" && (
          <div className="register-matching">
            <div className="spinner" aria-hidden />
            <h2>Verifying your face…</h2>
          </div>
        )}

        {(step === "done" || step === "already") && doneInfo && (
          <div className="register-result">
            <div className="register-result__icon">
              {step === "done" ? "✓" : "✓"}
            </div>
            <h2 className="register-step-heading">
              {step === "done" ? "Welcome!" : "Already checked in"}
            </h2>
            <p className="register-result__name">{doneInfo.name}</p>
            {doneInfo.fullCompanyName && (
              <p className="register-result__company">{doneInfo.fullCompanyName}</p>
            )}
            <p className="register-result__detail">
              {step === "done"
                ? `Checked in ${doneInfo.method === "face" ? "with face recognition" : "manually"}.`
                : doneInfo.checkedInAt
                  ? `You checked in at ${new Date(doneInfo.checkedInAt).toLocaleString("en-US", {
                      year: "numeric",
                      month: "numeric",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}.`
                  : "You are already checked in."}
            </p>
            <div className="register-actions">
              <button
                className="register-btn register-btn--primary register-btn--block"
                onClick={resetAll}
              >
                Check in another guest
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
