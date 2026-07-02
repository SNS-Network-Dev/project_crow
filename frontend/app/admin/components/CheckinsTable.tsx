"use client";

import { useMemo, useState } from "react";
import type { Checkin } from "./useAdminData";
import { downloadCSV, toCSV, type CsvColumn } from "./csvExport";
import styles from "./admin.module.css";

interface Props {
  checkins: Checkin[];
}

export default function CheckinsTable({ checkins }: Props) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return checkins;
    return checkins.filter((c) => c.name.toLowerCase().includes(q));
  }, [checkins, search]);

  const exportCheckinsCsv = () => {
    const columns: CsvColumn<Checkin>[] = [
      { key: "checked_in_at", header: "When", fmt: (r) => new Date(r.checked_in_at).toLocaleString() },
      { key: "name", header: "Name" },
      { key: "score", header: "Match", fmt: (r) => (r.score > 0 ? `${(r.score * 100).toFixed(0)}%` : "manual") },
    ];
    downloadCSV("project-crow-checkins.csv", toCSV(filtered, columns));
  };

  return (
    <div>
      <div className={styles.toolbar}>
        <input
          className={styles.searchInput}
          type="text"
          placeholder="Search by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className={styles.liveDot} title="Auto-refreshes every 10s" />
        <span className={styles.liveLabel}>Live</span>
        <button className={`btn btn--ghost btn--sm ${styles.exportBtn}`} onClick={exportCheckinsCsv}>
          Export CSV
        </button>
      </div>

      <p className={styles.resultCount}>
        {filtered.length} of {checkins.length} recent check-ins
      </p>

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
    </div>
  );
}