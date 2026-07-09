"use client";

import { useEffect, useState } from "react";
import { BASE_PATH } from "@/lib/basePath";

interface GuestSummary {
  name: string;
  companyEmail: string | null;
  fullCompanyName: string | null;
  designation: string | null;
}

interface FieldDiff {
  field: string;
  label: string;
  before: string | null;
  after: string | null;
}

interface UpdateSummary {
  name: string;
  companyEmail: string | null;
  diffs: FieldDiff[];
}

interface DuplicateRow {
  rowNumber: number;
  firstRow: number;
  name: string;
  companyEmail: string | null;
}

interface Preview {
  total: number;
  addCount: number;
  updateCount: number;
  unchangedCount: number;
  duplicateInFileCount: number;
  duplicatesInFile: DuplicateRow[];
  toAdd: GuestSummary[];
  toUpdate: UpdateSummary[];
}

export interface ImportSummary {
  inserted: number;
  updated: number;
  unchanged: number;
  skippedDuplicate: number;
  failed: number;
}

interface Props {
  file: File;
  onCancel: () => void;
  onImported: (summary: ImportSummary) => void;
}

const DASH = "—";

export default function ImportPreviewModal({ file, onCancel, onImported }: Props) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  // Dry-run: parse + classify the file without writing anything.
  useEffect(() => {
    let cancelled = false;
    const fd = new FormData();
    fd.append("file", file);
    fetch(`${BASE_PATH}/api/people/import?preview=1`, { method: "POST", body: fd })
      .then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => ({})) }))
      .then(({ ok, body }) => {
        if (cancelled) return;
        if (!ok || !body.ok) {
          setError(body.error ?? "Could not read the spreadsheet.");
          return;
        }
        setPreview(body as Preview);
      })
      .catch(() => {
        if (!cancelled) setError("Network error while reading the file.");
      });
    return () => {
      cancelled = true;
    };
  }, [file]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !importing) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, importing]);

  const confirmImport = async () => {
    setImporting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${BASE_PATH}/api/people/import`, {
        method: "POST",
        body: fd,
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        inserted?: number;
        updated?: number;
        unchanged?: number;
        skippedDuplicate?: number;
        failed?: number;
        error?: string;
      };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "Import failed.");
        setImporting(false);
        return;
      }
      onImported({
        inserted: body.inserted ?? 0,
        updated: body.updated ?? 0,
        unchanged: body.unchanged ?? 0,
        skippedDuplicate: body.skippedDuplicate ?? 0,
        failed: body.failed ?? 0,
      });
    } catch {
      setError("Network error during import.");
      setImporting(false);
    }
  };

  const actionable = preview ? preview.addCount + preview.updateCount : 0;
  const confirmLabel = (() => {
    if (importing) return "Applying…";
    if (!preview || actionable === 0) return "Nothing to apply";
    const bits: string[] = [];
    if (preview.addCount) bits.push(`add ${preview.addCount}`);
    if (preview.updateCount) bits.push(`update ${preview.updateCount}`);
    return `Apply — ${bits.join(" · ")}`;
  })();

  return (
    <div className="import-backdrop" onClick={importing ? undefined : onCancel}>
      <div
        className="import-modal"
        role="dialog"
        aria-label="Import preview"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="import-modal-head">
          <div>
            <h2>Import guests</h2>
            <p className="import-modal-file" title={file.name}>
              {file.name}
            </p>
          </div>
          <button
            type="button"
            className="import-modal-x"
            onClick={onCancel}
            aria-label="Close"
            disabled={importing}
          >
            ×
          </button>
        </div>

        {error && (
          <div className="notice notice--error" style={{ margin: "0 20px" }}>
            {error}
          </div>
        )}

        {!preview && !error && (
          <div className="import-modal-loading">
            <span className="spinner" aria-hidden /> Reading spreadsheet…
          </div>
        )}

        {preview && (
          <>
            <div className="import-stats">
              <div className="import-stat">
                <span className="import-stat-num">{preview.total}</span>
                <span className="import-stat-label">in file</span>
              </div>
              <div className="import-stat import-stat--add">
                <span className="import-stat-num">{preview.addCount}</span>
                <span className="import-stat-label">to add</span>
              </div>
              <div className="import-stat import-stat--update">
                <span className="import-stat-num">{preview.updateCount}</span>
                <span className="import-stat-label">to update</span>
              </div>
              <div className="import-stat">
                <span className="import-stat-num">{preview.unchangedCount}</span>
                <span className="import-stat-label">unchanged</span>
              </div>
            </div>

            <div className="import-lists">
              <section className="import-list">
                <h3>
                  To be added{" "}
                  <span className="import-list-count">{preview.addCount}</span>
                </h3>
                <div className="import-list-scroll">
                  {preview.toAdd.length === 0 ? (
                    <p className="muted import-list-empty">Nothing new to add.</p>
                  ) : (
                    <ul>
                      {preview.toAdd.map((g, i) => (
                        <li key={`a-${i}`}>
                          <span className="import-name">{g.name}</span>
                          {g.companyEmail && (
                            <span className="import-sub">{g.companyEmail}</span>
                          )}
                          <span className="import-sub">
                            {[g.fullCompanyName, g.designation]
                              .filter(Boolean)
                              .join(" · ") || DASH}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>

              <section className="import-list">
                <h3>
                  To be updated{" "}
                  <span className="import-list-count">{preview.updateCount}</span>
                </h3>
                <div className="import-list-scroll">
                  {preview.toUpdate.length === 0 ? (
                    <p className="muted import-list-empty">
                      No existing guests changed.
                    </p>
                  ) : (
                    <ul>
                      {preview.toUpdate.map((u, i) => (
                        <li key={`u-${i}`} className="import-update">
                          <span className="import-name">{u.name}</span>
                          {u.companyEmail && (
                            <span className="import-sub">{u.companyEmail}</span>
                          )}
                          <div className="import-diffs">
                            {u.diffs.map((d, j) => (
                              <div key={j} className="import-diff">
                                <span className="import-diff-field">{d.label}</span>
                                <span className="import-diff-before">
                                  {d.before || DASH}
                                </span>
                                <span className="import-diff-arrow">→</span>
                                <span className="import-diff-after">
                                  {d.after || DASH}
                                </span>
                              </div>
                            ))}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            </div>

            {preview.duplicatesInFile.length > 0 && (
              <section className="import-list import-dups">
                <h3>
                  Repeated rows ignored{" "}
                  <span className="import-list-count">
                    {preview.duplicateInFileCount}
                  </span>
                </h3>
                <div className="import-list-scroll">
                  <ul>
                    {preview.duplicatesInFile.map((d, i) => (
                      <li key={`d-${i}`}>
                        <span className="import-name">
                          Row {d.rowNumber}: {d.name}
                        </span>
                        {d.companyEmail && (
                          <span className="import-sub">{d.companyEmail}</span>
                        )}
                        <span className="import-sub">
                          same guest as row {d.firstRow} — only the first was kept
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            )}

            <div className="import-modal-foot">
              {preview.duplicateInFileCount > 0 && (
                <span className="import-foot-note">
                  {preview.duplicateInFileCount} repeated row
                  {preview.duplicateInFileCount === 1 ? "" : "s"} in file ignored
                </span>
              )}
              <button
                type="button"
                className="btn btn--ghost"
                onClick={onCancel}
                disabled={importing}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                onClick={confirmImport}
                disabled={importing || actionable === 0}
              >
                {confirmLabel}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
