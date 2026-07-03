"use client";

import { useCallback, useEffect, useState } from "react";
import { BASE_PATH } from "@/lib/basePath";

export interface AppSettings {
  earlyCheckinCountdownEnabled: boolean;
  earlyCheckinTargetIso: string;
}

export default function SettingsPanel() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${BASE_PATH}/api/settings`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setSettings(data);
      })
      .catch(() => {
        if (cancelled) return;
        setMessage("Could not load settings.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback(async () => {
    if (!settings || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`${BASE_PATH}/api/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          earlyCheckinCountdownEnabled: !settings.earlyCheckinCountdownEnabled,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error ?? "Failed to save.");
      } else {
        setSettings(data);
        setMessage("Setting saved.");
      }
    } catch {
      setMessage("Network error.");
    } finally {
      setSaving(false);
      window.setTimeout(() => setMessage(null), 3000);
    }
  }, [settings, saving]);

  if (loading || !settings) {
    return <p className="subtitle">Loading settings…</p>;
  }

  return (
    <div className="panel" style={{ maxWidth: 520 }}>
      <h2 style={{ marginBottom: 18 }}>Event settings</h2>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "16px 0",
          borderTop: "1px solid var(--border)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div>
          <strong>Early check-in countdown</strong>
          <p className="subtitle" style={{ margin: "4px 0 0" }}>
            Show a countdown timer on /early-checkin before the event opens.
          </p>
        </div>
        <button
          className={`btn ${settings.earlyCheckinCountdownEnabled ? "btn--danger" : "btn--primary"}`}
          onClick={toggle}
          disabled={saving}
        >
          {saving
            ? "Saving…"
            : settings.earlyCheckinCountdownEnabled
              ? "Disable"
              : "Enable"}
        </button>
      </div>

      <div style={{ marginTop: 16 }}>
        <p className="subtitle">
          Countdown target: {" "}
          <strong>
            {new Date(settings.earlyCheckinTargetIso).toLocaleString("en-MY", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </strong>
        </p>
      </div>

      {message && (
        <div
          className={`notice ${message.includes("error") || message.includes("Failed") || message.includes("Could not") ? "notice--error" : "notice--ok"}`}
          style={{ marginTop: 16 }}
        >
          {message}
        </div>
      )}
    </div>
  );
}
