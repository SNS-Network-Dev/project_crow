"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BASE_PATH } from "@/lib/basePath";

interface Checkin {
  id: number;
  person_id: number;
  name: string;
  score: number;
  checked_in_at: string;
}

interface Person {
  id: number;
  name: string;
  email: string | null;
  contact_number: string | null;
  company_email: string | null;
  full_company_name: string | null;
  designation: string | null;
  invited_by: string | null;
  remarks: string | null;
  photo_url: string | null;
  qr_code_path: string | null;
  consent_at: string | null;
  created_at: string;
  updated_at: string | null;
}

const DASH = "—"; // em dash
const TH: React.FC<React.ThHTMLAttributes<HTMLTableCellElement>> = (props) => (
  <th {...props} />
);

export default function AdminPage() {
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"people" | "checkins">("people");

  const load = useCallback(async () => {
    setError(null);
    try {
      const [c, p] = await Promise.all([
        fetch(`${BASE_PATH}/api/checkins?limit=50`).then((r) => r.json()),
        fetch(`${BASE_PATH}/api/people`).then((r) => r.json()),
      ]);
      setCheckins(c.checkins ?? []);
      setPeople(p.people ?? []);
    } catch {
      setError("Could not load admin data.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = useCallback(
    async (id: number, name: string) => {
      if (!confirm(`Delete ${name}? This removes their face data, photo, and check-ins.`)) return;
      const res = await fetch(`${BASE_PATH}/api/people/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setError("Delete failed.");
        return;
      }
      load();
    },
    [load]
  );

  return (
    <main className="wrap wrap--wide">
      <h1>Admin</h1>
      <p className="subtitle">People directory and recent check-ins.</p>
      {error && <div className="notice notice--error">{error}</div>}

      {/* ---- Tab bar ---- */}
      <div className="tab-bar">
        <button
          className={tab === "people" ? "tab tab--active" : "tab"}
          onClick={() => setTab("people")}
        >
          People ({people.length})
        </button>
        <button
          className={tab === "checkins" ? "tab tab--active" : "tab"}
          onClick={() => setTab("checkins")}
        >
          Check-ins ({checkins.length})
        </button>
      </div>

      {/* ---- People tab ---- */}
      {tab === "people" && (
        <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
          {people.length === 0 ? (
            <p className="muted" style={{ padding: 20 }}>
              No people enrolled yet.
            </p>
          ) : (
            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <TH>No</TH>
                    <TH>Photo</TH>
                    <TH>QR Code</TH>
                    <TH>Full Name</TH>
                    <TH>Contact Number</TH>
                    <TH>Company Email</TH>
                    <TH>Full Company Name</TH>
                    <TH>Designation</TH>
                    <TH>Invited By</TH>
                    <TH>Remarks</TH>
                    <TH>Consent</TH>
                    <TH>Last Modified</TH>
                    <TH></TH>
                  </tr>
                </thead>
                <tbody>
                  {people.map((p, i) => (
                    <tr key={p.id}>
                      <td className="td-no">{i + 1}</td>
                      <td className="td-photo">
                        {p.photo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.photo_url} alt={p.name} />
                        ) : (
                          <span className="avatar-placeholder">👤</span>
                        )}
                      </td>
                      <td className="td-qr">{DASH}</td>
                      <td className="td-name">{p.name}</td>
                      <td>{p.contact_number ?? DASH}</td>
                      <td>{p.company_email ?? DASH}</td>
                      <td>{p.full_company_name ?? DASH}</td>
                      <td>{p.designation ?? DASH}</td>
                      <td>{p.invited_by ?? DASH}</td>
                      <td className="td-remarks">{p.remarks ?? DASH}</td>
                      <td className="td-consent">
                        {p.consent_at ? (
                          <span className="consent-ok" title={new Date(p.consent_at).toLocaleString()}>
                            ✓
                          </span>
                        ) : (
                          <span className="consent-no">{DASH}</span>
                        )}
                      </td>
                      <td className="td-time">
                        {new Date(p.updated_at ?? p.created_at).toLocaleString()}
                      </td>
                      <td>
                        <button className="btn btn--danger btn--sm" onClick={() => remove(p.id, p.name)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ---- Check-ins tab ---- */}
      {tab === "checkins" && (
        <div className="panel">
          {checkins.length === 0 ? (
            <p className="muted">No check-ins yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Name</th>
                  <th>Match</th>
                </tr>
              </thead>
              <tbody>
                {checkins.map((c) => (
                  <tr key={c.id}>
                    <td>{new Date(c.checked_in_at).toLocaleString()}</td>
                    <td>{c.name}</td>
                    <td>{c.score > 0 ? `${(c.score * 100).toFixed(0)}%` : "manual"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <p className="subtitle">
        <Link href="/">← Home</Link>
      </p>
    </main>
  );
}
