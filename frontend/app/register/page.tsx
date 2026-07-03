"use client";

import { useCallback, useState } from "react";
// import Image from "next/image";
import { BASE_PATH } from "@/lib/basePath";
import FaceCapture from "../components/FaceCapture";

interface FoundPerson {
  id: number;
  name: string;
  contactNumber: string | null;
  companyEmail: string | null;
  fullCompanyName: string | null;
  designation: string | null;
  invitedBy: string | null;
  remarks: string | null;
}

type RegisterStep = "lookup" | "confirm" | "ready" | "review" | "done";

const TERMS_URL = "https://www.sns.com.my/terms-of-use/";
const PDPA_URL = "https://www.sns.com.my/pdpa-notice/";

export default function RegisterPage() {
  const [step, setStep] = useState<RegisterStep>("lookup");
  const [name, setName] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
  const [person, setPerson] = useState<FoundPerson | null>(null);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);

  const setPhotoBlob = useCallback(
    (blob: Blob | null) => {
      setPhoto(blob);
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return blob ? URL.createObjectURL(blob) : null;
      });
    },
    [setPhoto],
  );

  const resetAll = useCallback(() => {
    setStep("lookup");
    setName("");
    setCompanyEmail("");
    setPerson(null);
    setPhotoBlob(null);
    setConsent(false);
    setError(null);
    setDoneMsg(null);
    setCameraOpen(false);
  }, [setPhotoBlob]);

  const lookup = useCallback(async () => {
    setError(null);
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
        setError(body.error ?? "Lookup failed.");
        return;
      }
      setPerson(body);
      setStep("confirm");
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }, [name, companyEmail]);

  const handleCapture = useCallback(
    (blob: Blob) => {
      setPhotoBlob(blob);
      setCameraOpen(false);
      setStep("review");
    },
    [setPhotoBlob],
  );

  const enroll = useCallback(async () => {
    setError(null);
    if (!photo || !person) return;
    if (!consent) {
      setError("You must agree to the consent statement.");
      return;
    }

    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("photo", photo, "photo.jpg");
      fd.append("name", person.name);
      fd.append("companyEmail", person.companyEmail ?? "");
      fd.append("consent", "true");

      const res = await fetch(`${BASE_PATH}/api/register`, {
        method: "POST",
        body: fd,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Enrollment failed.");
        setStep("review");
        return;
      }
      setDoneMsg(`You're all set, ${body.name}! Face check-in is now active.`);
      setStep("done");
    } catch {
      setError("Network error. Try again.");
      setStep("review");
    } finally {
      setBusy(false);
    }
  }, [photo, person, consent]);

  const DASH = "—";

  const stepIndex: Record<RegisterStep, number> = {
    lookup: 1,
    confirm: 2,
    ready: 3,
    review: 4,
    done: 5,
  };
  const stepLabel: Record<number, string> = {
    1: "Find invitation",
    2: "Confirm details",
    3: "Photo guide",
    4: "Review photo",
    5: "Done",
  };

  return (
    <main className="wrap">
      <div className="panel register-card">
        {step === "lookup" && (
          <h1 className="register-title register-title--in-card">
            Skip the queue and register for face check in
          </h1>
        )}

        <div className="register-stepper" aria-label="Registration progress">
          {[1, 2, 3, 4, 5].map((n) => (
            <div
              key={n}
              className={`register-step${
                n === stepIndex[step]
                  ? " register-step--active"
                  : n < stepIndex[step]
                    ? " register-step--completed"
                    : ""
              }`}
            >
              <div className="register-step__dot">{n < stepIndex[step] ? "✓" : n}</div>
              <span className="register-step__label">{stepLabel[n]}</span>
            </div>
          ))}
        </div>

        {error && <div className="notice notice--error">{error}</div>}
        {doneMsg && <div className="notice notice--ok">{doneMsg}</div>}

        {step === "lookup" && (
          <>
            <div className="register-field">
              <label htmlFor="reg-name">Full Name</label>
              <input
                id="reg-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. John Doe"
              />
            </div>
            <div className="register-field">
              <label htmlFor="reg-email">Company Email</label>
              <input
                id="reg-email"
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
              {busy ? "Checking…" : "Check"}
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
                <dt>Invited By</dt>
                <dd>{person.invitedBy ?? DASH}</dd>
                <dt>Remarks</dt>
                <dd>{person.remarks ?? DASH}</dd>
              </dl>
            </div>
            <div className="register-actions">
              <button
                className="register-btn register-btn--primary register-btn--block"
                onClick={() => setStep("ready")}
              >
                Yes, this is me
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

        {step === "ready" && (
          <>
            <h2 className="register-step-heading">Ready for your selfie?</h2>
            <ul className="register-requirements">
              <li>Good lighting on your face</li>
              <li>Plain background behind you</li>
              <li>No sunglasses, mask, or hat</li>
              <li>Face lined up clearly on the next screen</li>
            </ul>
            <div className="register-privacy-notice">
              <strong>Your privacy matters.</strong> We do not keep your photos
              for model training. Your photo will be deleted after the event.
            </div>
            <div className="register-actions">
              <button
                className="register-btn register-btn--primary register-btn--block"
                onClick={() => setCameraOpen(true)}
              >
                I&apos;m ready — take my photo
              </button>
              <button
                className="register-btn register-btn--ghost register-btn--block"
                onClick={resetAll}
              >
                Cancel
              </button>
            </div>
          </>
        )}

        {(step === "review" || step === "done") && preview && (
          <>
            <h2 className="register-step-heading">
              {step === "done"
                ? "Enrollment complete"
                : "Are you satisfied with this photo?"}
            </h2>
            <div className="register-preview-wrap">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt="Captured photo"
                className="register-preview"
              />
            </div>

            {step !== "done" && (
              <>
                <div className="register-consent">
                  <input
                    id="consent"
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  <label htmlFor="consent">
                    I consent to my face data being stored and used for
                    check-in. I have read the{" "}
                    <a href={TERMS_URL} target="_blank" rel="noreferrer">
                      Terms of Use
                    </a>{" "}
                    and{" "}
                    <a href={PDPA_URL} target="_blank" rel="noreferrer">
                      PDPA Notice
                    </a>
                    .
                  </label>
                </div>
                <div className="register-actions register-actions--row">
                  <button
                    className="register-btn register-btn--primary"
                    onClick={enroll}
                    disabled={busy || !consent}
                  >
                    {busy ? "Saving…" : "Yes, save my face check-in"}
                  </button>
                  <button
                    className="register-btn register-btn--ghost"
                    onClick={() => {
                      setPhotoBlob(null);
                      setConsent(false);
                      setStep("ready");
                      setCameraOpen(true);
                    }}
                  >
                    Retake
                  </button>
                </div>
              </>
            )}

            {step === "done" && (
              <div className="register-actions">
                <button
                  className="register-btn register-btn--primary register-btn--block"
                  onClick={resetAll}
                >
                  Register another person
                </button>
              </div>
            )}
          </>
        )}

        <FaceCapture
          open={cameraOpen}
          onClose={() => setCameraOpen(false)}
          onCapture={handleCapture}
          onError={(msg) => setError(msg)}
        />
      </div>
    </main>
  );
}
