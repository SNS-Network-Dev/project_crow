"use client";

import { useEffect, useMemo, useState } from "react";

interface Props {
  targetIso: string;
  enabled?: boolean;
  eventName?: string;
  hoursBefore?: number;
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

export default function CountdownTimer({
  targetIso,
  enabled = true,
  eventName = "the event",
  hoursBefore = 1,
}: Props) {
  const target = useMemo(() => new Date(targetIso).getTime(), [targetIso]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [enabled]);

  if (!enabled || now >= target) return null;

  const diff = Math.max(0, target - now);
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  return (
    <div className="register-countdown">
      <h2>
        Self check-in for {eventName} opens in
      </h2>
      <div className="register-countdown__grid">
        <div className="register-countdown__unit">
          <span>{pad(days)}</span>
          <label>Days</label>
        </div>
        <div className="register-countdown__unit">
          <span>{pad(hours)}</span>
          <label>Hours</label>
        </div>
        <div className="register-countdown__unit">
          <span>{pad(minutes)}</span>
          <label>Minutes</label>
        </div>
        <div className="register-countdown__unit">
          <span>{pad(seconds)}</span>
          <label>Seconds</label>
        </div>
      </div>
      <p className="register-countdown__hint">
        You can check in {hoursBefore} {hoursBefore === 1 ? "hour" : "hours"}{" "}
        before the event starts.
      </p>
    </div>
  );
}
