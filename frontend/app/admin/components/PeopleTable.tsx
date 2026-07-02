"use client";

import { useMemo, useState } from "react";
import type { Checkin, Person } from "./useAdminData";
import { downloadCSV, toCSV, type CsvColumn } from "./csvExport";
import styles from "./admin.module.css";

const DASH = "—";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface Props {
  people: Person[];
  checkins: Checkin[];
  onSelect: (id: number) => void;
}

type ConsentFilter = "all" | "yes" | "no";

export default function PeopleTable({ people, checkins, onSelect }: Props) {
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [invitedByFilter, setInvitedByFilter] = useState("");
  const [consentFilter, setConsentFilter] = useState<ConsentFilter>("all");

  // Distinct filter option lists.
  const companies = useMemo(
    () =>
      Array.from(new Set(people.map((p) => p.full_company_name).filter(Boolean))) as string[],
    [people],
  );
  const inviters = useMemo(
    () => Array.from(new Set(people.map((p) => p.invited_by).filter(Boolean))) as string[],
    [people],
  );

  // Per-person check-in count from the loaded check-ins (capped at the table's
  // limit — the drawer fetches the full history separately).
  const checkinCount = useMemo(() => {
    const m = new Map<number, number>();
    for (const c of checkins) m.set(c.person_id, (m.get(c.person_id) ?? 0) + 1);
    return m;
  }, [checkins]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return people.filter((p) => {
      if (q) {
        const hay = `${p.name} ${p.email ?? ""} ${p.full_company_name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (companyFilter && p.full_company_name !== companyFilter) return false;
      if (invitedByFilter && p.invited_by !== invitedByFilter) return false;
      if (consentFilter === "yes" && !p.consent_at) return false;
      if (consentFilter === "no" && p.consent_at) return false;
      return true;
    });
  }, [people, search, companyFilter, invitedByFilter, consentFilter]);

  const hasFilters = search || companyFilter || invitedByFilter || consentFilter !== "all";
  const clearFilters = () => {
    setSearch("");
    setCompanyFilter("");
    setInvitedByFilter("");
    setConsentFilter("all");
  };

  const exportPeopleCsv = () => {
    const columns: CsvColumn<Person>[] = [
      { key: "name", header: "Name" },
      { key: "contact_number", header: "Contact Number" },
      { key: "email", header: "Personal Email" },
      { key: "company_email", header: "Company Email" },
      { key: "full_company_name", header: "Company" },
      { key: "designation", header: "Designation" },
      { key: "invited_by", header: "Invited By" },
      { key: "remarks", header: "Remarks" },
      { key: "consent_at", header: "Consent At", fmt: (r) => (r.consent_at ? new Date(r.consent_at).toLocaleString() : "no") },
      { key: "updated_at", header: "Last Modified", fmt: (r) => (r.updated_at ? new Date(r.updated_at).toLocaleString() : "") },
    ];
    downloadCSV("project-crow-people.csv", toCSV(filtered, columns));
  };

  return (
    <div>
      <div className={styles.toolbar}>
        <input
          className={styles.searchInput}
          type="text"
          placeholder="Search name, email, company…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className={styles.select}
          value={companyFilter}
          onChange={(e) => setCompanyFilter(e.target.value)}
          aria-label="Filter by company"
        >
          <option value="">All companies</option>
          {companies.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          className={styles.select}
          value={invitedByFilter}
          onChange={(e) => setInvitedByFilter(e.target.value)}
          aria-label="Filter by invited by"
        >
          <option value="">All inviters</option>
          {inviters.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          className={styles.select}
          value={consentFilter}
          onChange={(e) => setConsentFilter(e.target.value as ConsentFilter)}
          aria-label="Filter by consent"
        >
          <option value="all">Any consent</option>
          <option value="yes">Consented</option>
          <option value="no">No consent</option>
        </select>
        {hasFilters && (
          <button className={`btn btn--ghost btn--sm ${styles.clearBtn}`} onClick={clearFilters}>
            Clear
          </button>
        )}
        <button className={`btn btn--ghost btn--sm ${styles.exportBtn}`} onClick={exportPeopleCsv}>
          Export CSV
        </button>
      </div>

      <p className={styles.resultCount}>
        {filtered.length} of {people.length} guests
      </p>

      <div className="admin-table-wrapper">
        <table className={`admin-table ${styles.adminTable}`}>
          <thead>
            <tr>
              <th className="td-no">No</th>
              <th className="td-photo">Photo</th>
              <th>Full Name</th>
              <th className={styles.colCompany}>Company</th>
              <th className={styles.colDesignation}>Designation</th>
              <th className={styles.colInvited}>Invited By</th>
              <th className="td-consent">Consent</th>
              <th className={styles.colCount}>Check-ins</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className={styles.emptyRow}>
                  No guests match these filters.
                </td>
              </tr>
            )}
            {filtered.map((p, i) => {
              const count = checkinCount.get(p.id) ?? 0;
              return (
                <tr key={p.id} className={styles.row} onClick={() => onSelect(p.id)}>
                  <td className="td-no">{i + 1}</td>
                  <td className="td-photo">
                    {p.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.photo_url} alt={p.name} />
                    ) : (
                      <span className="avatar-placeholder">{initials(p.name)}</span>
                    )}
                  </td>
                  <td className="td-name">{p.name}</td>
                  <td className={styles.colCompany}>{p.full_company_name ?? DASH}</td>
                  <td className={styles.colDesignation}>{p.designation ?? DASH}</td>
                  <td className={styles.colInvited}>{p.invited_by ?? DASH}</td>
                  <td className="td-consent">
                    {p.consent_at ? (
                      <span className="consent-ok" title={new Date(p.consent_at).toLocaleString()}>
                        Yes
                      </span>
                    ) : (
                      <span className="consent-no">{DASH}</span>
                    )}
                  </td>
                  <td className={styles.colCount}>
                    <span className={styles.checkinCount} data-zero={count === 0 || undefined}>
                      {count}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}