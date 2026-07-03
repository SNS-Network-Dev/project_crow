"use client";

import { useEffect, useState } from "react";
import styles from "./admin.module.css";

function formatDateTime(d: Date): string {
  // 3/7/2026 11:06 AM
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const t1 = window.setTimeout(() => setNow(new Date()), 0);
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => {
      window.clearTimeout(t1);
      window.clearInterval(id);
    };
  }, []);

  return (
    <div className={styles.liveClock} title="Auto-refreshes every 10s">
      <span className={styles.liveDot} />
      <span className={styles.liveLabel}>Live</span>
      {now && <span className={styles.liveTime}>{formatDateTime(now)}</span>}
    </div>
  );
}
