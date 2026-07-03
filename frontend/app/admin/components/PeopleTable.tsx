"use client";

import { useMemo, useState } from "react";
import type { Checkin, Person } from "./useAdminData";
import styles from "./admin.module.css";

const DASH = "—";

type CheckedInFilter = "all" | "checkedIn" | "notCheckedIn";

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
  checkedInFilter?: CheckedInFilter;
}

const PAGE_SIZE_OPTIONS = ["10", "20", "50", "100", "200", "all"];

export default function PeopleTable({
  people,
  checkins,
  search,
  onSelect,
  checkedInFilter = "all",
}: Props) {
  const [pageSize, setPageSize] = useState<string>("10");
  const [page, setPage] = useState(1);

  const checkedInIds = useMemo(
    () => new Set(checkins.map((c) => c.person_id)),
    [checkins],
  );

  const filtered = useMemo(() => {
    let rows = people;
    if (checkedInFilter === "checkedIn") {
      rows = people.filter((p) => checkedInIds.has(p.id));
    } else if (checkedInFilter === "notCheckedIn") {
      rows = people.filter((p) => !checkedInIds.has(p.id));
    }

    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((p) => {
      const hay =
        `${p.name} ${p.email ?? ""} ${p.full_company_name ?? ""} ${p.designation ?? ""} ${
          p.remarks ?? ""
        }`.toLowerCase();
      return hay.includes(q);
    });
  }, [people, checkedInIds, checkedInFilter, search]);

  const size = pageSize === "all" ? Infinity : Number(pageSize);
  const totalPages =
    size === Infinity ? 1 : Math.max(1, Math.ceil(filtered.length / size));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = size === Infinity ? 0 : (safePage - 1) * size;
  const paged =
    size === Infinity ? filtered : filtered.slice(start, start + size);

  return (
    <div>
      <div className="admin-table-wrapper">
        <table className={`admin-table ${styles.adminTable}`}>
          <thead>
            <tr>
              <th className="td-no">No</th>
              <th className="td-photo">Photo</th>
              <th className={styles.colDesignation}>Designation</th>
              <th>Full Name</th>
              <th className={styles.colCompany}>Company</th>
              <th className={styles.colRemarks}>Remarks</th>
              <th className="td-qr">QR</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className={styles.emptyRow}>
                  No guests match this search.
                </td>
              </tr>
            )}
            {paged.map((p, i) => (
              <tr
                key={p.id}
                className={styles.row}
                onClick={() => onSelect(p.id)}
              >
                <td className="td-no">{start + i + 1}</td>
                <td className="td-photo">
                  {p.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.photo_url} alt={p.name} />
                  ) : (
                    <span className="avatar-placeholder">
                      {initials(p.name)}
                    </span>
                  )}
                </td>
                <td className={styles.colDesignation}>
                  {p.designation ?? DASH}
                </td>
                <td className="td-name">{p.name}</td>
                <td className={styles.colCompany}>
                  {p.full_company_name ?? DASH}
                </td>
                <td
                  className={styles.colRemarks}
                  title={p.remarks ?? undefined}
                >
                  {p.remarks ?? DASH}
                </td>
                <td className="td-qr" title={p.qr_code_path ?? undefined}>
                  {p.qr_code_path ?? DASH}
                </td>
              </tr>
            ))}
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
