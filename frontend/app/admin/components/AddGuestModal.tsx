"use client";

import { useEffect, useState } from "react";
import { BASE_PATH } from "@/lib/basePath";
import styles from "./admin.module.css";

interface Props {
  onClose: () => void;
  onAdded: (name: string) => void;
}

interface Form {
  name: string;
  contactNumber: string;
  companyEmail: string;
  fullCompanyName: string;
  designation: string;
  invitedBy: string;
  remarks: string;
}

const EMPTY: Form = {
  name: "",
  contactNumber: "",
  companyEmail: "",
  fullCompanyName: "",
  designation: "",
  invitedBy: "",
  remarks: "",
};

export default function AddGuestModal({ onClose, onAdded }: Props) {
  const [form, setForm] = useState<Form>(EMPTY);
  const [consent, setConsent] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof Form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const submit = async () => {
    if (!form.name.trim()) {
      setError("Full name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${BASE_PATH}/api/people`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, consent }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "Could not add guest.");
        setSaving(false);
        return;
      }
      onAdded(form.name.trim());
    } catch {
      setError("Network error. Try again.");
      setSaving(false);
    }
  };

  return (
    <div className="import-backdrop" onClick={saving ? undefined : onClose}>
      <div
        className="import-modal"
        style={{ width: "min(560px, 96vw)" }}
        role="dialog"
        aria-label="Add guest"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="import-modal-head">
          <div>
            <h2>Add guest</h2>
            <p className="import-modal-file">
              Creates one guest with a new QR code. No photo — they can enrol a
              face later via the register link.
            </p>
          </div>
          <button
            type="button"
            className="import-modal-x"
            onClick={onClose}
            aria-label="Close"
            disabled={saving}
          >
            ×
          </button>
        </div>

        {error && (
          <div className="notice notice--error" style={{ margin: "0 20px" }}>
            {error}
          </div>
        )}

        <div
          className={styles.drawerForm}
          style={{
            padding: "6px 20px 10px",
            overflowY: "auto",
            flex: 1,
            minHeight: 0,
          }}
        >
          <label>
            Full name *
            <input
              type="text"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              autoFocus
            />
          </label>
          <label>
            Contact number
            <input
              type="tel"
              value={form.contactNumber}
              onChange={(e) => set("contactNumber", e.target.value)}
            />
          </label>
          <label>
            Company email
            <input
              type="email"
              value={form.companyEmail}
              onChange={(e) => set("companyEmail", e.target.value)}
            />
          </label>
          <label>
            Company
            <input
              type="text"
              value={form.fullCompanyName}
              onChange={(e) => set("fullCompanyName", e.target.value)}
            />
          </label>
          <label>
            Designation
            <input
              type="text"
              value={form.designation}
              onChange={(e) => set("designation", e.target.value)}
            />
          </label>
          <label>
            Invited by
            <input
              type="text"
              value={form.invitedBy}
              onChange={(e) => set("invitedBy", e.target.value)}
            />
          </label>
          <label>
            Remarks
            <textarea
              value={form.remarks}
              onChange={(e) => set("remarks", e.target.value)}
            />
          </label>
          <label
            style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
          >
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              style={{ width: "auto" }}
            />
            Consent given
          </label>
        </div>

        <div className="import-modal-foot">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            onClick={submit}
            disabled={saving}
          >
            {saving ? "Adding…" : "Add guest"}
          </button>
        </div>
      </div>
    </div>
  );
}
