"use client";

import { useCallback, useEffect, useState } from "react";
import { BASE_PATH } from "@/lib/basePath";
import { useToast } from "../components/ToastProvider";
import FaceCapture from "../components/FaceCapture";
import CountdownTimer from "../components/CountdownTimer";

// Guest self check-in. Face-first: a guest who registered facial recognition at
// /register just scans their face and is checked in — no need to type their
// details again. Guests who didn't register a face (or can't be recognized)
// fall back to a name + company-email lookup that checks them in directly.

type CheckinStep =
  | "start"
  | "lookup"
  | "confirm"
  | "matching"
  | "done"
  | "already";

interface DoneInfo {
  name: string;
  fullCompanyName: string | null;
  checkedInAt?: string;
  method: "face" | "manual";
}

// Guest found via the manual name/email lookup, shown on the confirm step.
interface FoundPerson {
  id: number;
  name: string;
  contactNumber: string | null;
  companyEmail: string | null;
  fullCompanyName: string | null;
  designation: string | null;
}

// The /api/checkin recognition result, enriched with the guest's details.
interface Candidate {
  person_id: number;
  name: string;
  full_company_name: string | null;
  score: number;
  confident: boolean;
}

// Friendly timestamp for the success screen, e.g. "17 Jul 2026, 7:32 PM".
function formatCheckinTime(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export default function CheckinPage() {
  const toast = useToast();
  const [step, setStep] = useState<CheckinStep>("start");
  const [countdownEnabled, setCountdownEnabled] = useState(false);
  const [countdownTarget, setCountdownTarget] = useState(
    new Date().toISOString(),
  );
  const [eventName, setEventName] = useState("the event");
  const [hoursBefore, setHoursBefore] = useState(1);
  const [name, setName] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
  const [person, setPerson] = useState<FoundPerson | null>(null);
  const [consent, setConsent] = useState(false);
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
        if (typeof data.earlyCheckinHoursBefore === "number") {
          setHoursBefore(data.earlyCheckinHoursBefore);
        }
      })
      .catch(() => {
        /* ignore; defaults are safe */
      });
  }, []);

  const resetAll = useCallback(() => {
    setStep("start");
    setName("");
    setCompanyEmail("");
    setPerson(null);
    setConsent(false);
    setCameraOpen(false);
    setBusy(false);
    setDoneInfo(null);
  }, []);

  const showResult = useCallback(
    (info: DoneInfo, already: boolean) => {
      setDoneInfo(info);
      setStep(already ? "already" : "done");
      toast.show(
        already
          ? `${info.name} is already checked in.`
          : `${info.name} checked in.`,
        already ? "info" : "ok",
      );
    },
    [toast],
  );

  // Face-first path: open-set recognition against everyone who registered a
  // face. A confident match is checked in immediately; otherwise we send the
  // guest to the name lookup instead of a dead end.
  const handleFaceScan = useCallback(
    async (blob: Blob) => {
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
          setStep("start");
          return;
        }
        const candidates: Candidate[] = body.candidates ?? [];
        const match = candidates.find((c) => c.confident);
        if (!match) {
          toast.show(
            "We couldn't recognize you. Please try again, or find yourself by name.",
            "error",
          );
          setStep("start");
          return;
        }
        const confirmRes = await fetch(`${BASE_PATH}/api/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            person_id: match.person_id,
            score: match.score,
            method: "self",
          }),
        });
        const cb = await confirmRes.json().catch(() => ({}));
        if (!confirmRes.ok) {
          toast.show(cb.error ?? "Could not record check-in.", "error");
          setStep("start");
          return;
        }
        showResult(
          {
            name: cb.name ?? match.name,
            fullCompanyName: cb.full_company_name ?? match.full_company_name,
            checkedInAt: cb.checked_in_at,
            method: "face",
          },
          !!cb.alreadyCheckedIn,
        );
      } catch {
        toast.show("Network error. Try again.", "error");
        setStep("start");
      } finally {
        setBusy(false);
      }
    },
    [toast, showResult],
  );

  // Fallback path, step 1: find the guest by name + company email, then show a
  // confirm screen so they can verify the details and agree before checking in.
  const lookupPerson = useCallback(async () => {
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
      const found = await res.json().catch(() => ({}));
      if (!res.ok || !found.id) {
        toast.show(found.error ?? "No registration found.", "error");
        return;
      }
      setPerson({
        id: found.id,
        name: found.name,
        contactNumber: found.contactNumber ?? null,
        companyEmail: found.companyEmail ?? null,
        fullCompanyName: found.fullCompanyName ?? null,
        designation: found.designation ?? null,
      });
      setConsent(false);
      setStep("confirm");
    } catch {
      toast.show("Network error. Try again.", "error");
    } finally {
      setBusy(false);
    }
  }, [name, companyEmail, toast]);

  // Fallback path, step 2: guest confirmed the details and agreed — record it.
  const confirmManualCheckin = useCallback(async () => {
    if (!person || !consent) return;
    setBusy(true);
    try {
      const cres = await fetch(`${BASE_PATH}/api/checkin/manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ person_id: person.id, method: "self" }),
      });
      const cb = await cres.json().catch(() => ({}));
      if (!cres.ok) {
        toast.show(cb.error ?? "Check-in failed.", "error");
        return;
      }
      showResult(
        {
          name: cb.name ?? person.name,
          fullCompanyName: cb.full_company_name ?? person.fullCompanyName,
          checkedInAt: cb.checked_in_at,
          method: "manual",
        },
        !!cb.alreadyCheckedIn,
      );
    } catch {
      toast.show("Network error. Try again.", "error");
    } finally {
      setBusy(false);
    }
  }, [person, consent, toast, showResult]);

  const eventOpen =
    !countdownEnabled || Date.now() >= new Date(countdownTarget).getTime();

  return (
    <main className="cx-stage cx-stage--bottom cx-stage--raised">
      <div
        className="page-bg"
        style={{
          ["--page-bg-url" as string]: `url("${BASE_PATH}/kelvin-bg.jpg")`,
        }}
        aria-hidden
      />
      <div className="panel register-card">
        {step === "start" && (
          <h1 className="register-title register-title--in-card">
            Self check-in
          </h1>
        )}

        {step === "start" && !eventOpen && (
          <CountdownTimer
            targetIso={countdownTarget}
            enabled={countdownEnabled}
            eventName={eventName}
            hoursBefore={hoursBefore}
          />
        )}

        {step === "start" && eventOpen && (
          <>
            <p
              className="subtitle"
              style={{ textAlign: "center", marginBottom: 24 }}
            >
              Registered your face? Just scan to check in.
            </p>
            <div className="register-actions">
              <button
                className="register-btn register-btn--primary register-btn--block"
                onClick={() => setCameraOpen(true)}
                disabled={busy}
              >
                Scan my face
              </button>
              <button
                className="register-btn register-btn--ghost register-btn--block"
                onClick={() => setStep("lookup")}
                disabled={busy}
              >
                Manual check-in
              </button>
            </div>
          </>
        )}

        {step === "lookup" && (
          <>
            <h2 className="register-step-heading">Find your invitation</h2>
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
            <div className="register-actions">
              <button
                className="register-btn register-btn--primary register-btn--block"
                onClick={lookupPerson}
                disabled={busy || !name.trim() || !companyEmail.trim()}
              >
                {busy ? "Finding…" : "Continue"}
              </button>
              <button
                className="register-btn register-btn--ghost register-btn--block"
                onClick={() => setStep("start")}
                disabled={busy}
              >
                Back to face scan
              </button>
            </div>
          </>
        )}

        {step === "confirm" && person && (
          <>
            <h2 className="register-step-heading">Confirm your details</h2>
            <div className="register-confirm-card">
              <dl>
                <dt>Full Name</dt>
                <dd>{person.name}</dd>
                <dt>Company Email</dt>
                <dd>{person.companyEmail ?? "—"}</dd>
                <dt>Full Company Name</dt>
                <dd>{person.fullCompanyName ?? "—"}</dd>
                <dt>Designation</dt>
                <dd>{person.designation ?? "—"}</dd>
              </dl>
            </div>
            <label className="register-consent">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>
                I agree that this is me and that I will be attending the event.
              </span>
            </label>
            <div className="register-actions">
              <button
                className="register-btn register-btn--primary register-btn--block"
                onClick={confirmManualCheckin}
                disabled={busy || !consent}
              >
                {busy ? "Checking in…" : "Check in"}
              </button>
              <button
                className="register-btn register-btn--ghost register-btn--block"
                onClick={() => setStep("lookup")}
                disabled={busy}
              >
                Back
              </button>
            </div>
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
            <div className="register-result__icon">✓</div>
            <h2 className="register-step-heading">
              {step === "done"
                ? "Checked in successfully!"
                : "Already checked in"}
            </h2>
            <p className="register-result__name">{doneInfo.name}</p>
            {doneInfo.fullCompanyName && (
              <p className="register-result__company">
                {doneInfo.fullCompanyName}
              </p>
            )}
            <div className="register-checkin-meta">
              <div className="register-checkin-meta__row">
                <span>Check-in type</span>
                <strong>
                  {doneInfo.method === "face"
                    ? "Face recognition"
                    : "Manual (name lookup)"}
                </strong>
              </div>
              <div className="register-checkin-meta__row">
                <span>Check-in time</span>
                <strong>{formatCheckinTime(doneInfo.checkedInAt)}</strong>
              </div>
            </div>
            <div className="register-screenshot-note">
              <strong>📸 Guest Arrival Notice:</strong> While your check-in
              completed in advance via QR Code or Facial Recognition, please
              screenshot and kindly present yourself at the registration counter
              upon arrival to collect your event wristband for venue admission.
            </div>
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

      {/* Rendered OUTSIDE .register-card: that card has a backdrop-filter, which
          creates a containing block for position:fixed, so the fullscreen camera
          would otherwise anchor to the card box instead of the viewport. */}
      <FaceCapture
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={handleFaceScan}
        onError={(msg) => toast.show(msg, "error")}
      />
    </main>
  );
}
