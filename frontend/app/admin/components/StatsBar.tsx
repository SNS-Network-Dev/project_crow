"use client";

import type { Stats } from "./useAdminData";
import styles from "./admin.module.css";

interface Props {
  stats: Stats | null;
  loading: boolean;
}

function Stat({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className={styles.stat} data-accent={accent ? "true" : undefined}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>{value}</span>
      {hint && <span className={styles.statHint}>{hint}</span>}
    </div>
  );
}

export default function StatsBar({ stats, loading }: Props) {
  if (loading && !stats) {
    return <div className={styles.statsBar}>Loading status…</div>;
  }
  if (!stats) return null;

  return (
    <div className={styles.statsBar}>
      <Stat label="Registered" value={String(stats.registered)} />
      <Stat
        label="Checked in"
        value={String(stats.checkedIn)}
        hint={`${stats.distinctCheckedIn} unique guests`}
        accent
      />
      <Stat label="Today" value={String(stats.today)} />
      <Stat label="Not checked in" value={String(stats.notCheckedIn)} hint="registered − checked-in" />
    </div>
  );
}