"use client";

import { useCallback, useEffect, useState } from "react";
import { BASE_PATH } from "@/lib/basePath";
import type { Checkin, Person, PersonPatch } from "./useAdminData";
import styles from "./admin.module.css";

const DASH = "—";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface Props {
  person: Person | null;
  onPatch: (id: number, patch: PersonPatch) => Promise<boolean>;
  onDelete: (id: number) => Promise<boolean>;
  onClose: () => void;
}

interface EditForm {
  name: string;
  email: string;
  contactNumber: string;
  companyEmail: string;
  fullCompanyName: string;
  designation: string;
  invitedBy: string;
  remarks: string;
}

function toForm(p: Person): EditForm {
  return {
    name: p.name ?? "",
    email: p.email ?? "",
    contactNumber: p.contact_number ?? "",
    companyEmail: p.company_email ?? "",
    fullCompanyName: p.full_company_name ?? "",
    designation: p.designation ?? "",
    invitedBy: p.invited_by ?? "",
    remarks: p.remarks ?? "",
  };
}

// Declared at module scope so it isn't recreated each render (react-hooks/static-components).
function DetailField({ label, value }: { label: string; value: string | null }) {
  return (
    <div className={styles.detailField}>
      <span className={styles.detailLabel}>{label}</span>
      <span className={styles.detailValue}>{value || DASH}</span>
    </div>
  );
}

export default function PersonDrawer({ person, onPatch, onDelete, onClose }: Props) {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [form, setForm] = useState<EditForm | null>(() => (person ? toForm(person) : null));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [history, setHistory] = useState<Checkin[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Reset internal state when the selected person changes — the React
  // "adjust state during render" pattern (no effect, no cascading render).
  // Normalize to null on both sides so `undefined !== null` doesn't loop.
  const currentId = person?.id ?? null;
  const [prevPersonId, setPrevPersonId] = useState<number | null>(currentId);
  if (currentId !== prevPersonId) {
    setPrevPersonId(currentId);
    setMode("view");
    setForm(person ? toForm(person) : null);
    setError(null);
    setConfirmingDelete(false);
    setHistoryLoading(!!person);
  }

  // Lazy-fetch this person's full check-in history (the table is capped at 50).
  // No synchronous setState here — all updates are in async callbacks.
  useEffect(() => {
    if (!person) return;
    let cancelled = false;
    fetch(`${BASE_PATH}/api/checkins?personId=${person.id}&limit=200`, { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => {
        if (!cancelled) setHistory((b.checkins ?? []) as Checkin[]);
      })
      .catch(() => {
        if (!cancelled) setHistory([]);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [person]);

  // Lock body scroll + Esc-to-close while the drawer is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const setField = (key: keyof EditForm, value: string) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  const save = useCallback(async () => {
    if (!person || !form) return;
    if (!form.name.trim()) {
      setError("Full name is required.");
      return;
    }
    // Trim; empty strings become null so the field is cleared, not blanked-to-"".
    const patch: PersonPatch = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      contactNumber: form.contactNumber.trim() || null,
      companyEmail: form.companyEmail.trim() || null,
      fullCompanyName: form.fullCompanyName.trim() || null,
      designation: form.designation.trim() || null,
      invitedBy: form.invitedBy.trim() || null,
      remarks: form.remarks.trim() || null,
    };
    setSaving(true);
    setError(null);
    const ok = await onPatch(person.id, patch);
    setSaving(false);
    if (ok) {
      setMode("view");
    } else {
      setError("Could not save. Try again.");
    }
  }, [person, form, onPatch]);

  const doDelete = useCallback(async () => {
    if (!person) return;
    const ok = await onDelete(person.id);
    if (!ok) setError("Could not delete. Try again.");
    // The parent closes the drawer after a successful delete.
  }, [person, onDelete]);

  if (!person || !form) return null;

  return (
    <>
      <div className={styles.drawerBackdrop} onClick={onClose} aria-hidden />
      <aside
        className={styles.drawer}
        role="dialog"
        aria-label={`Guest details: ${person.name}`}
      >
        <div className={styles.drawerHeader}>
          <div className={styles.drawerIdentity}>
            {person.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={person.photo_url} alt={person.name} className={styles.drawerAvatar} />
            ) : (
              <span className={`${styles.drawerAvatar} ${styles.drawerAvatarPlaceholder}`}>
                {initials(person.name)}
              </span>
            )}
            <div>
              <h2 className={styles.drawerName}>{person.name}</h2>
              <p className={styles.drawerSub}>
                {person.designation ? person.designation : "Guest"}
                {person.full_company_name ? ` · ${person.full_company_name}` : ""}
              </p>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <span className={styles.closeIcon} aria-hidden />
          </button>
        </div>

        <div className={styles.drawerBody}>
          {error && <div className="notice notice--error">{error}</div>}

          <div className={styles.drawerPhoto}>
            {person.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={person.photo_url} alt={person.name} />
            ) : (
              <span className={styles.drawerPhotoPlaceholder}>{initials(person.name)}</span>
            )}
          </div>

          {mode === "view" ? (
            <>
              <section className={styles.detailSection}>
                <h3 className={styles.detailHeading}>Personal</h3>
                <DetailField label="Contact number" value={person.contact_number} />
                <DetailField label="Personal email" value={person.email} />
              </section>
              <section className={styles.detailSection}>
                <h3 className={styles.detailHeading}>Company</h3>
                <DetailField label="Company email" value={person.company_email} />
                <DetailField label="Company" value={person.full_company_name} />
                <DetailField label="Designation" value={person.designation} />
                <DetailField label="Invited by" value={person.invited_by} />
              </section>
              <section className={styles.detailSection}>
                <h3 className={styles.detailHeading}>Notes</h3>
                <DetailField label="Remarks" value={person.remarks} />
                <DetailField
                  label="Consent"
                  value={person.consent_at ? `yes · ${new Date(person.consent_at).toLocaleString()}` : "no"}
                />
                <DetailField
                  label="Last modified"
                  value={
                    person.updated_at
                      ? new Date(person.updated_at).toLocaleString()
                      : new Date(person.created_at).toLocaleString()
                  }
                />
              </section>

              <section className={styles.detailSection}>
                <h3 className={styles.detailHeading}>
                  Check-ins{history.length > 0 ? ` (${history.length})` : ""}
                </h3>
                {historyLoading ? (
                  <p className="muted">Loading history…</p>
                ) : history.length === 0 ? (
                  <p className="muted">No check-ins yet.</p>
                ) : (
                  <ul className={styles.historyList}>
                    {history.map((c) => (
                      <li key={c.id} className={styles.historyItem}>
                        <span className={styles.historyWhen}>{new Date(c.checked_in_at).toLocaleString()}</span>
                        <span className={styles.historyScore}>
                          {c.score > 0 ? `${(c.score * 100).toFixed(0)}%` : "manual"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          ) : (
            <div className={styles.drawerForm}>
              <label>
                Full name *
                <input type="text" value={form.name} onChange={(e) => setField("name", e.target.value)} />
              </label>
              <label>
                Contact number
                <input type="tel" value={form.contactNumber} onChange={(e) => setField("contactNumber", e.target.value)} />
              </label>
              <label>
                Personal email
                <input type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} />
              </label>
              <label>
                Company email
                <input type="email" value={form.companyEmail} onChange={(e) => setField("companyEmail", e.target.value)} />
              </label>
              <label>
                Company
                <input type="text" value={form.fullCompanyName} onChange={(e) => setField("fullCompanyName", e.target.value)} />
              </label>
              <label>
                Designation
                <input type="text" value={form.designation} onChange={(e) => setField("designation", e.target.value)} />
              </label>
              <label>
                Invited by
                <input type="text" value={form.invitedBy} onChange={(e) => setField("invitedBy", e.target.value)} />
              </label>
              <label>
                Remarks
                <textarea value={form.remarks} onChange={(e) => setField("remarks", e.target.value)} />
              </label>
            </div>
          )}
        </div>

        <div className={styles.drawerFooter}>
          {mode === "view" ? (
            confirmingDelete ? (
              <div className={styles.confirmInline}>
                <span>This removes face data, photo, and check-ins.</span>
                <div className={styles.confirmActions}>
                  <button className="btn btn--danger btn--sm" onClick={doDelete}>
                    Confirm delete
                  </button>
                  <button className="btn btn--ghost btn--sm" onClick={() => setConfirmingDelete(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.footerActions}>
                <button className="btn" onClick={() => setMode("edit")}>
                  Edit
                </button>
                <button className="btn btn--danger" onClick={() => setConfirmingDelete(true)}>
                  Delete
                </button>
              </div>
            )
          ) : (
            <div className={styles.footerActions}>
              <button className="btn" onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </button>
              <button className="btn btn--ghost" onClick={() => setMode("view")} disabled={saving}>
                Cancel
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
