"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import { BASE_PATH } from "@/lib/basePath";
import FaceCapture from "../components/FaceCapture";

const COUNTRY_CODES = [
  { code: "+60", label: "Malaysia (+60)", flag: "🇲🇾" },
  { code: "+65", label: "Singapore (+65)", flag: "🇸🇬" },
  { code: "+62", label: "Indonesia (+62)", flag: "🇮🇩" },
  { code: "+66", label: "Thailand (+66)", flag: "🇹🇭" },
  { code: "+84", label: "Vietnam (+84)", flag: "🇻🇳" },
  { code: "+63", label: "Philippines (+63)", flag: "🇵🇭" },
  { code: "+91", label: "India (+91)", flag: "🇮🇳" },
  { code: "+86", label: "China (+86)", flag: "🇨🇳" },
  { code: "+81", label: "Japan (+81)", flag: "🇯🇵" },
  { code: "+82", label: "South Korea (+82)", flag: "🇰🇷" },
  { code: "+1", label: "USA / Canada (+1)", flag: "🇺🇸" },
  { code: "+44", label: "UK (+44)", flag: "🇬🇧" },
  { code: "+61", label: "Australia (+61)", flag: "🇦🇺" },
  { code: "+", label: "Other", flag: "🌐" },
];

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [countryCode, setCountryCode] = useState("+60");
  const [contactNumber, setContactNumber] = useState("");
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
    setCountryCode("+60");
    setContactNumber("");
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

  const fullContactNumber = useCallback(() => {
    const digits = contactNumber.trim().replace(/\D/g, "");
    if (!digits) return "";
    return `${countryCode} ${digits}`;
  }, [countryCode, contactNumber]);

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
      const phone = fullContactNumber();
      if (phone) fd.append("contactNumber", phone);
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
      setOkMsg(
        `Registered ${body.name} (id ${body.id}). QR code: ${body.qrCode}`,
      );
      resetForm();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }, [
    photo,
    name,
    fullContactNumber,
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
    opts?: {
      type?: string;
      required?: boolean;
      textarea?: boolean;
      placeholder?: string;
    },
  ) => (
    <>
      <label htmlFor={htmlFor}>
        {label}
        {opts?.required ? " *" : ""}
      </label>
      {opts?.textarea ? (
        <textarea
          id={htmlFor}
          value={value}
          onChange={onChange}
          placeholder={opts.placeholder}
        />
      ) : (
        <input
          id={htmlFor}
          type={opts?.type ?? "text"}
          value={value}
          onChange={onChange}
          placeholder={opts?.placeholder}
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
            placeholder: "e.g. John Doe",
          })}

          <label htmlFor="contactNumber">Contact Number</label>
          <div className="register-phone-row">
            <select
              id="countryCode"
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
              aria-label="Country code"
            >
              {COUNTRY_CODES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.flag} {c.label}
                </option>
              ))}
            </select>
            <input
              id="contactNumber"
              type="tel"
              value={contactNumber}
              onChange={(e) => setContactNumber(e.target.value)}
              placeholder="123456789"
            />
          </div>
        </fieldset>

        {/* ---- Company Information ---- */}
        <fieldset className="form-section">
          <legend>Company Information</legend>
          {field(
            "Company Email",
            "companyEmail",
            companyEmail,
            (e) => setCompanyEmail(e.target.value),
            { type: "email", placeholder: "e.g. john@snsnetwork.my" },
          )}
          {field(
            "Full Company Name",
            "fullCompanyName",
            fullCompanyName,
            (e) => setFullCompanyName(e.target.value),
            { placeholder: "e.g. SNS Network Sdn Bhd" },
          )}
          {field(
            "Designation",
            "designation",
            designation,
            (e) => setDesignation(e.target.value),
            { placeholder: "e.g. Director or CEO" },
          )}
          {field(
            "Invited By",
            "invitedBy",
            invitedBy,
            (e) => setInvitedBy(e.target.value),
            { placeholder: "e.g. Mr. Kelvin" },
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
            { textarea: true, placeholder: "e.g. Allergy to fish" },
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
