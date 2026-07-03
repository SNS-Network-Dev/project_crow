"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import { BASE_PATH } from "@/lib/basePath";
import FaceCapture from "../components/FaceCapture";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [email, setEmail] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
  const [fullCompanyName, setFullCompanyName] = useState("");
  const [designation, setDesignation] = useState("");
  const [invitedBy, setInvitedBy] = useState("");
  const [remarks, setRemarks] = useState("");
  const [consent, setConsent] = useState(false);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

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

  const resetForm = useCallback(() => {
    setName("");
    setContactNumber("");
    setEmail("");
    setCompanyEmail("");
    setFullCompanyName("");
    setDesignation("");
    setInvitedBy("");
    setRemarks("");
    setConsent(false);
    setPhotoBlob(null);
    setCameraError(null);
    setCameraOpen(false);
  }, [setPhotoBlob]);

  const submit = useCallback(async () => {
    setError(null);
    setOkMsg(null);
    if (!photo) return setError("Add a photo first (capture or upload).");
    if (!name.trim()) return setError("Full name is required.");
    if (!consent) return setError("Consent is required.");

    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("photo", photo, "photo.jpg");
      fd.append("name", name.trim());
      if (email.trim()) fd.append("email", email.trim());
      if (contactNumber.trim())
        fd.append("contactNumber", contactNumber.trim());
      if (companyEmail.trim()) fd.append("companyEmail", companyEmail.trim());
      if (fullCompanyName.trim())
        fd.append("fullCompanyName", fullCompanyName.trim());
      if (designation.trim()) fd.append("designation", designation.trim());
      if (invitedBy.trim()) fd.append("invitedBy", invitedBy.trim());
      if (remarks.trim()) fd.append("remarks", remarks.trim());
      fd.append("consent", "true");

      const res = await fetch(`${BASE_PATH}/api/register`, {
        method: "POST",
        body: fd,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Registration failed.");
        return;
      }
      setOkMsg(`Registered ${body.name} (id ${body.id}).`);
      resetForm();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }, [
    photo,
    name,
    email,
    contactNumber,
    companyEmail,
    fullCompanyName,
    designation,
    invitedBy,
    remarks,
    consent,
    resetForm,
  ]);

  const field = (
    label: string,
    htmlFor: string,
    value: string,
    onChange: (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => void,
    opts?: { type?: string; required?: boolean; textarea?: boolean },
  ) => (
    <>
      <label htmlFor={htmlFor}>
        {label}
        {opts?.required ? " *" : ""}
      </label>
      {opts?.textarea ? (
        <textarea id={htmlFor} value={value} onChange={onChange} />
      ) : (
        <input
          id={htmlFor}
          type={opts?.type ?? "text"}
          value={value}
          onChange={onChange}
        />
      )}
    </>
  );

  return (
    <main className="wrap">
      <div className="register-logo">
        <Image
          src={`${BASE_PATH}/sns-network-logo.png`}
          alt="SNS Network"
          width={160}
          height={60}
          priority
        />
      </div>
      <h1 className="register-title">Register</h1>

      <div className="panel">
        {error && <div className="notice notice--error">{error}</div>}
        {okMsg && <div className="notice notice--ok">{okMsg}</div>}

        {/* ---- Personal Information ---- */}
        <fieldset className="form-section">
          <legend>Personal Information</legend>
          {field("Full Name", "name", name, (e) => setName(e.target.value), {
            required: true,
          })}
          {field(
            "Contact Number",
            "contactNumber",
            contactNumber,
            (e) => setContactNumber(e.target.value),
            { type: "tel" },
          )}
          {field(
            "Personal Email",
            "email",
            email,
            (e) => setEmail(e.target.value),
            { type: "email" },
          )}
        </fieldset>

        {/* ---- Company Information ---- */}
        <fieldset className="form-section">
          <legend>Company Information</legend>
          {field(
            "Company Email",
            "companyEmail",
            companyEmail,
            (e) => setCompanyEmail(e.target.value),
            { type: "email" },
          )}
          {field("Full Company Name", "fullCompanyName", fullCompanyName, (e) =>
            setFullCompanyName(e.target.value),
          )}
          {field("Designation", "designation", designation, (e) =>
            setDesignation(e.target.value),
          )}
          {field("Invited By", "invitedBy", invitedBy, (e) =>
            setInvitedBy(e.target.value),
          )}
        </fieldset>

        {/* ---- Additional Notes ---- */}
        <fieldset className="form-section">
          <legend>Additional Notes</legend>
          {field(
            "Remarks",
            "remarks",
            remarks,
            (e) => setRemarks(e.target.value),
            { textarea: true },
          )}
        </fieldset>

        {/* ---- Photo ---- */}
        <fieldset className="form-section register-photo-section">
          <legend>Photo *</legend>
          {cameraError && (
            <div className="notice notice--error">{cameraError}</div>
          )}
          {preview && (
            <div className="register-preview-wrap">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="Preview" className="register-preview" />
            </div>
          )}
          <div className="row">
            <button
              type="button"
              className="btn"
              onClick={() => setCameraOpen(true)}
            >
              Take photo
            </button>
            <label
              className="btn btn--ghost"
              style={{ margin: 0, display: "inline-flex" }}
            >
              Upload file
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => setPhotoBlob(e.target.files?.[0] ?? null)}
              />
            </label>
            {preview && (
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setPhotoBlob(null)}
              >
                Remove
              </button>
            )}
          </div>
          <FaceCapture
            open={cameraOpen}
            onClose={() => setCameraOpen(false)}
            onCapture={setPhotoBlob}
            onError={setCameraError}
          />
        </fieldset>

        {/* ---- Consent ---- */}
        <div className="checkbox-row">
          <input
            id="consent"
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <label htmlFor="consent" style={{ margin: 0, fontWeight: 400 }}>
            I consent to my face data being stored and used for check-in.
          </label>
        </div>

        <button
          className="btn btn--lg btn--block"
          style={{ marginTop: 18 }}
          onClick={submit}
          disabled={busy}
        >
          {busy ? "Registering…" : "Register"}
        </button>
      </div>
    </main>
  );
}
