"use client";

import { useMemo, useState } from "react";
import type { Checkin, Person } from "./useAdminData";
import { useToast } from "../../components/ToastProvider";
import styles from "./admin.module.css";

// The page index can land past the last page after filtering/page-size changes.
// We derive a clamped page instead of resetting state inside an effect.

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
  onDeleteCheckin: (id: number) => Promise<boolean>;
}

const PAGE_SIZE_OPTIONS = ["10", "20", "50", "100", "200", "all"];

export default function CheckinsTable({
  people,
  checkins,
  search,
  onSelect,
  onDeleteCheckin,
}: Props) {
  const toast = useToast();
  const [pageSize, setPageSize] = useState<string>("10");
  const [page, setPage] = useState(1);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const peopleById = useMemo(() => {
    const m = new Map<number, Person>();
    for (const p of people) m.set(p.id, p);
    return m;
  }, [people]);

  const rows = useMemo(() => {
    return checkins.map((c) => ({
      checkin: c,
      person: peopleById.get(c.person_id),
    }));
  }, [checkins, peopleById]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(({ checkin: c, person: p }) => {
      const hay =
        `${c.name} ${p?.full_company_name ?? ""} ${p?.designation ?? ""} ${
          p?.remarks ?? ""
        }`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search]);

  const size = pageSize === "all" ? Infinity : Number(pageSize);
  const totalPages =
    size === Infinity ? 1 : Math.max(1, Math.ceil(filtered.length / size));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = size === Infinity ? 0 : (safePage - 1) * size;
  const paged =
    size === Infinity ? filtered : filtered.slice(start, start + size);

  const handleUndo = async (c: Checkin) => {
    setDeletingId(c.id);
    const ok = await onDeleteCheckin(c.id);
    setDeletingId(null);
    if (ok) {
      toast.show(`${c.name} check-in undone.`, "ok");
    } else {
      toast.show("Could not undo check-in. Try again.", "error");
    }
  };

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
              <th className={styles.colTime}>Checked in time</th>
              <th className={styles.colUndo}>Undo</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className={styles.emptyRow}>
                  No check-ins yet.
                </td>
              </tr>
            )}
            {paged.map(({ checkin: c, person: p }, i) => (
              <tr
                key={c.id}
                className={styles.row}
                onClick={() => p && onSelect(p.id)}
              >
                <td className="td-no">{start + i + 1}</td>
                <td className="td-photo">
                  {p?.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.photo_url} alt={p.name} />
                  ) : (
                    <span className="avatar-placeholder">
                      {initials(c.name)}
                    </span>
                  )}
                </td>
                <td className={styles.colDesignation}>
                  {p?.designation ?? DASH}
                </td>
                <td className="td-name">{c.name}</td>
                <td className={styles.colCompany}>
                  {p?.full_company_name ?? DASH}
                </td>
                <td
                  className={styles.colRemarks}
                  title={p?.remarks ?? undefined}
                >
                  {p?.remarks ?? DASH}
                </td>
                <td className={styles.colTime}>
                  {new Date(c.checked_in_at).toLocaleString("en-US", {
                    year: "numeric",
                    month: "numeric",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </td>
                <td className={styles.colUndo}>
                  <button
                    type="button"
                    className="btn btn--danger btn--sm"
                    disabled={deletingId === c.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUndo(c);
                    }}
                  >
                    {deletingId === c.id ? "Undoing…" : "Undo"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.tableFooter}>
        <div className={styles.pageSizeWrap}>
          <label
            htmlFor="crow-checkin-page-size"
            className={styles.pageSizeLabel}
          >
            Show
          </label>
          <select
            id="crow-checkin-page-size"
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
          {filtered.length} of {checkins.length} checked in
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
