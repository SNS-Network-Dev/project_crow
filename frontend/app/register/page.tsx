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

  return (
    <main className="wrap">
      <div className="panel register-card">
        <h1 className="register-title register-title--in-card">
          Skip the queue and register for face check in
        </h1>
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
              className="register-submit"
              onClick={lookup}
              disabled={busy || !name.trim() || !companyEmail.trim()}
            >
              {busy ? "Checking…" : "Check"}
            </button>
          </>
        )}

        {step === "confirm" && person && (
          <>
            <h2 style={{ marginBottom: 8 }}>Is this you?</h2>
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
            <div className="row" style={{ marginTop: 18 }}>
              <button
                className="btn btn--lg btn--block"
                onClick={() => setStep("ready")}
              >
                Yes, this is me
              </button>
              <button
                className="btn btn--ghost btn--lg btn--block"
                onClick={resetAll}
              >
                No, start over
              </button>
            </div>
          </>
        )}

        {step === "ready" && (
          <>
            <h2 style={{ marginBottom: 12 }}>Ready for your selfie?</h2>
            <div className="notice notice--info" style={{ marginBottom: 16 }}>
              Make sure you have good lighting, a plain background, and no
              sunglasses or mask. Line up your face clearly on the next screen.
            </div>
            <p className="subtitle" style={{ marginBottom: 24 }}>
              We do not keep your photos for model training. Your photo will be
              deleted after the event.
            </p>
            <button
              className="btn btn--lg btn--block"
              onClick={() => setCameraOpen(true)}
            >
              I&apos;m ready — take my photo
            </button>
            <button
              className="btn btn--ghost btn--lg btn--block"
              style={{ marginTop: 10 }}
              onClick={resetAll}
            >
              Cancel
            </button>
          </>
        )}

        {(step === "review" || step === "done") && preview && (
          <>
            <h2 style={{ marginBottom: 12 }}>
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
                <div className="row" style={{ marginTop: 18 }}>
                  <button
                    className="btn btn--lg"
                    onClick={enroll}
                    disabled={busy || !consent}
                  >
                    {busy ? "Saving…" : "Yes, save my face check-in"}
                  </button>
                  <button
                    className="btn btn--ghost btn--lg"
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
              <button
                className="btn btn--lg btn--block"
                style={{ marginTop: 18 }}
                onClick={resetAll}
              >
                Register another person
              </button>
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
