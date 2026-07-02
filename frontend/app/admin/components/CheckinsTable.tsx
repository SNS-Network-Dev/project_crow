"use client";

import { useMemo } from "react";
import type { Checkin } from "./useAdminData";
import styles from "./admin.module.css";

interface Props {
  checkins: Checkin[];
  search: string;
}

export default function CheckinsTable({ checkins, search }: Props) {
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return checkins;
    return checkins.filter((c) => c.name.toLowerCase().includes(q));
  }, [checkins, search]);

  return (
    <div>
      <div className={styles.toolbar}>
        <span className={styles.liveDot} title="Auto-refreshes every 10s" />
        <span className={styles.liveLabel}>Live</span>
      </div>

      <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
        {filtered.length === 0 ? (
          <p className="muted" style={{ padding: 20 }}>
            No check-ins yet.
          </p>
        ) : (
          <div className="admin-table-wrapper">
            <table className={`admin-table ${styles.adminTable}`}>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Name</th>
                  <th>Match</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id}>
                    <td className="td-time">{new Date(c.checked_in_at).toLocaleString()}</td>
                    <td className="td-name">{c.name}</td>
                    <td>{c.score > 0 ? `${(c.score * 100).toFixed(0)}%` : "manual"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className={styles.resultCount} style={{ marginTop: 12 }}>
        {filtered.length} of {checkins.length} recent check-ins
      </p>
    </div>
  );
}