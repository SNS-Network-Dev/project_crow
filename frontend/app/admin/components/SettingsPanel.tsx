"use client";

import { useCallback, useEffect, useState } from "react";
import { BASE_PATH } from "@/lib/basePath";

export interface AppSettingsResponse {
  eventName: string;
  eventStartIso: string;
  earlyCheckinCountdownEnabled: boolean;
  earlyCheckinHoursBefore: number;
  earlyCheckinTargetIso: string;
}

export default function SettingsPanel() {
  const [settings, setSettings] = useState<AppSettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${BASE_PATH}/api/settings`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data: AppSettingsResponse) => {
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

  const save = useCallback(async () => {
    if (!settings || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`${BASE_PATH}/api/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventName: settings.eventName,
          eventStartIso: settings.eventStartIso,
          earlyCheckinCountdownEnabled: settings.earlyCheckinCountdownEnabled,
          earlyCheckinHoursBefore: settings.earlyCheckinHoursBefore,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error ?? "Failed to save.");
      } else {
        setSettings(data);
        setMessage("Settings saved.");
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

  const isError =
    message &&
    (message.includes("error") ||
      message.includes("Failed") ||
      message.includes("Could not"));

  return (
    <div className="panel">
      <h2 style={{ marginBottom: 22 }}>Event settings</h2>

      <div className="register-field" style={{ marginBottom: 16 }}>
        <label htmlFor="settings-event-name">Event name</label>
        <input
          id="settings-event-name"
          type="text"
          value={settings.eventName}
          onChange={(e) =>
            setSettings((s) => (s ? { ...s, eventName: e.target.value } : s))
          }
          placeholder="e.g. Kelvin Pah's Birthday"
        />
      </div>

      <div className="register-field" style={{ marginBottom: 22 }}>
        <label htmlFor="settings-event-start">Event start time</label>
        <input
          id="settings-event-start"
          type="datetime-local"
          value={settings.eventStartIso.slice(0, 16)}
          onChange={(e) => {
            const local = e.target.value;
            if (!local) return;
            // Convert local datetime-local value to an ISO string with MYT offset.
            const withOffset = `${local}:00+08:00`;
            setSettings((s) => (s ? { ...s, eventStartIso: withOffset } : s));
          }}
        />
        <p className="subtitle" style={{ marginTop: 6, fontSize: "0.85rem" }}>
          Times are in Malaysia Time (UTC+8).
        </p>
      </div>

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
          <strong>Self check-in countdown</strong>
          <p className="subtitle" style={{ margin: "4px 0 0" }}>
            Show a countdown on the self check-in page until check-in opens.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={settings.earlyCheckinCountdownEnabled}
          className={`register-btn ${
            settings.earlyCheckinCountdownEnabled
              ? "register-btn--primary"
              : "register-btn--ghost"
          }`}
          onClick={() =>
            setSettings((s) =>
              s ? { ...s, earlyCheckinCountdownEnabled: !s.earlyCheckinCountdownEnabled } : s
            )
          }
          disabled={saving}
        >
          {settings.earlyCheckinCountdownEnabled ? "On" : "Off"}
        </button>
      </div>

      <div className="register-field" style={{ marginTop: 16 }}>
        <label htmlFor="settings-early-hours">
          Open self check-in this many hours before the event
        </label>
        <input
          id="settings-early-hours"
          type="number"
          min={0}
          max={72}
          step={1}
          value={settings.earlyCheckinHoursBefore}
          onChange={(e) => {
            const n = Math.round(Number(e.target.value));
            setSettings((s) =>
              s
                ? {
                    ...s,
                    earlyCheckinHoursBefore: Number.isFinite(n)
                      ? Math.min(72, Math.max(0, n))
                      : 0,
                  }
                : s,
            );
          }}
          style={{ maxWidth: 140 }}
        />
      </div>

      <div style={{ marginTop: 16 }}>
        <p className="subtitle">
          Self check-in opens at:{" "}
          <strong>
            {new Date(settings.earlyCheckinTargetIso).toLocaleString("en-MY", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </strong>
        </p>
      </div>

      <button
        className="register-btn register-btn--primary register-btn--block"
        style={{ marginTop: 22 }}
        onClick={save}
        disabled={saving}
      >
        {saving ? "Saving…" : "Save settings"}
      </button>

      {message && (
        <div
          className={`notice ${isError ? "notice--error" : "notice--ok"}`}
          style={{ marginTop: 16 }}
        >
          {message}
        </div>
      )}
    </div>
  );
}
