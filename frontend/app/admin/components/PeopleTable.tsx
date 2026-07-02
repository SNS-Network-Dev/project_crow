"use client";

import { useEffect, useMemo, useState } from "react";
import type { Checkin, Person } from "./useAdminData";
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
  search: string;
  onSelect: (id: number) => void;
}

const PAGE_SIZE_OPTIONS = ["10", "20", "50", "100", "200", "all"];

export default function PeopleTable({ people, checkins, search, onSelect }: Props) {
  const [pageSize, setPageSize] = useState<string>("10");
  const [page, setPage] = useState(1);

  // Per-person check-in count from the loaded check-ins (capped at the table's
  // limit — the drawer fetches the full history separately).
  const checkinCount = useMemo(() => {
    const m = new Map<number, number>();
    for (const c of checkins) m.set(c.person_id, (m.get(c.person_id) ?? 0) + 1);
    return m;
  }, [checkins]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) => {
      const hay = `${p.name} ${p.email ?? ""} ${p.full_company_name ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [people, search]);

  // Reset to the first page whenever the result set or page size changes —
  // otherwise a stale page index can land past the last page after filtering.
  useEffect(() => {
    setPage(1);
  }, [search, pageSize]);

  const size = pageSize === "all" ? Infinity : Number(pageSize);
  const totalPages = size === Infinity ? 1 : Math.max(1, Math.ceil(filtered.length / size));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = size === Infinity ? 0 : (safePage - 1) * size;
  const paged = size === Infinity ? filtered : filtered.slice(start, start + size);

  return (
    <div>
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
              <th className={styles.colRemarks}>Remarks</th>
              <th className="td-consent">Checked in</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className={styles.emptyRow}>
                  No guests match this search.
                </td>
              </tr>
            )}
            {paged.map((p, i) => {
              const count = checkinCount.get(p.id) ?? 0;
              const checkedIn = count > 0;
              return (
                <tr key={p.id} className={styles.row} onClick={() => onSelect(p.id)}>
                  <td className="td-no">{start + i + 1}</td>
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
                  <td className={styles.colRemarks} title={p.remarks ?? undefined}>
                    {p.remarks ?? DASH}
                  </td>
                  <td className="td-consent">
                    {checkedIn ? (
                      <span className="consent-ok">Yes</span>
                    ) : (
                      <span className="consent-no">{DASH}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={styles.tableFooter}>
        <div className={styles.pageSizeWrap}>
          <label htmlFor="crow-page-size" className={styles.pageSizeLabel}>
            Show
          </label>
          <select
            id="crow-page-size"
            className={styles.select}
            value={pageSize}
            onChange={(e) => setPageSize(e.target.value)}
          >
            {PAGE_SIZE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt === "all" ? "ALL" : opt}
              </option>
            ))}
          </select>
          <span>per page</span>
        </div>

        <div className={styles.resultCount}>
          {filtered.length} of {people.length} guests
        </div>

        {totalPages > 1 && (
          <div className={styles.pager}>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
            >
              Prev
            </button>
            <span className={styles.pagerInfo}>
              Page {safePage} of {totalPages}
            </span>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}