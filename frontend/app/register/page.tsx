"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BASE_PATH } from "@/lib/basePath";

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
  const [cameraOn, setCameraOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const setPhotoBlob = useCallback((blob: Blob | null) => {
    setPhoto(blob);
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return blob ? URL.createObjectURL(blob) : null;
    });
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera needs HTTPS or localhost. Use file upload instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      streamRef.current = stream;
      setCameraOn(true);
      setTimeout(async () => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      }, 0);
    } catch {
      setError("Could not start the camera. Use file upload instead.");
    }
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (b) => {
        if (b) setPhotoBlob(b);
        stopCamera();
      },
      "image/jpeg",
      0.9
    );
  }, [setPhotoBlob, stopCamera]);

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
  }, [setPhotoBlob]);

  const submit = useCallback(async () => {
    setError(null);
    setOkMsg(null);
    if (!photo) return setError("Add a photo first (upload or capture).");
    if (!name.trim()) return setError("Full name is required.");
    if (!consent) return setError("Consent is required.");

    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("photo", photo, "photo.jpg");
      fd.append("name", name.trim());
      if (email.trim()) fd.append("email", email.trim());
      if (contactNumber.trim()) fd.append("contactNumber", contactNumber.trim());
      if (companyEmail.trim()) fd.append("companyEmail", companyEmail.trim());
      if (fullCompanyName.trim()) fd.append("fullCompanyName", fullCompanyName.trim());
      if (designation.trim()) fd.append("designation", designation.trim());
      if (invitedBy.trim()) fd.append("invitedBy", invitedBy.trim());
      if (remarks.trim()) fd.append("remarks", remarks.trim());
      fd.append("consent", "true");

      const res = await fetch(`${BASE_PATH}/api/register`, { method: "POST", body: fd });
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
  }, [photo, name, email, contactNumber, companyEmail, fullCompanyName, designation, invitedBy, remarks, consent, resetForm]);

  const field = (
    label: string,
    htmlFor: string,
    value: string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void,
    opts?: { type?: string; required?: boolean; textarea?: boolean }
  ) => (
    <>
      <label htmlFor={htmlFor}>
        {label}
        {opts?.required ? " *" : ""}
      </label>
      {opts?.textarea ? (
        <textarea id={htmlFor} value={value} onChange={onChange} />
      ) : (
        <input id={htmlFor} type={opts?.type ?? "text"} value={value} onChange={onChange} />
      )}
    </>
  );

  return (
    <main className="wrap">
      <h1>Register</h1>
      <p className="subtitle">Enroll a new person. Use a clear, solo, front-facing photo.</p>

      <div className="panel">
        {error && <div className="notice notice--error">{error}</div>}
        {okMsg && <div className="notice notice--ok">{okMsg}</div>}

        {/* ---- Photo ---- */}
        <label>Photo *</label>
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="preview"
            style={{ width: 160, height: 160, objectFit: "cover", borderRadius: 12, marginBottom: 10 }}
          />
        )}

        {cameraOn ? (
          <>
            <div className="video-shell" style={{ maxHeight: "40vh", marginBottom: 10 }}>
              <video ref={videoRef} playsInline muted autoPlay />
            </div>
            <div className="row">
              <button type="button" className="btn" onClick={capture}>
                Capture
              </button>
              <button type="button" className="btn btn--ghost" onClick={stopCamera}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <div className="row">
            <label className="btn btn--ghost" style={{ margin: 0, display: "inline-flex" }}>
              Upload file
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => setPhotoBlob(e.target.files?.[0] ?? null)}
              />
            </label>
            <button type="button" className="btn btn--ghost" onClick={startCamera}>
              Use camera
            </button>
          </div>
        )}

        {/* ---- Personal Information ---- */}
        <fieldset className="form-section">
          <legend>Personal Information</legend>
          {field("Full Name", "name", name, (e) => setName(e.target.value), { required: true })}
          {field("Contact Number", "contactNumber", contactNumber, (e) => setContactNumber(e.target.value), { type: "tel" })}
          {field("Personal Email", "email", email, (e) => setEmail(e.target.value), { type: "email" })}
        </fieldset>

        {/* ---- Company Information ---- */}
        <fieldset className="form-section">
          <legend>Company Information</legend>
          {field("Company Email", "companyEmail", companyEmail, (e) => setCompanyEmail(e.target.value), { type: "email" })}
          {field("Full Company Name", "fullCompanyName", fullCompanyName, (e) => setFullCompanyName(e.target.value))}
          {field("Designation", "designation", designation, (e) => setDesignation(e.target.value))}
          {field("Invited By", "invitedBy", invitedBy, (e) => setInvitedBy(e.target.value))}
        </fieldset>

        {/* ---- Remarks ---- */}
        <fieldset className="form-section">
          <legend>Additional Notes</legend>
          {field("Remarks", "remarks", remarks, (e) => setRemarks(e.target.value), { textarea: true })}
        </fieldset>

        {/* ---- Consent ---- */}
        <div className="checkbox-row">
          <input id="consent" type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <label htmlFor="consent" style={{ margin: 0, fontWeight: 400 }}>
            I consent to my face data being stored and used for check-in.
          </label>
        </div>

        <button className="btn btn--lg btn--block" style={{ marginTop: 18 }} onClick={submit} disabled={busy}>
          {busy ? "Registering…" : "Register"}
        </button>
      </div>
    </main>
  );
}
