"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BASE_PATH } from "@/lib/basePath";
import {
  DEFAULT_PROMPT,
  DEFAULT_PAIR_PROMPT,
  DEFAULT_GROUP_PROMPT,
  PROMPT_MAX,
} from "@/lib/avatarPrompts";

// Operator control surface for the photo booth: live GPU status/queue, how many
// variants each mode generates, and (advanced) the generation prompt overrides.
// Variants + prompts persist in settings.json and apply on the next capture — no
// restart. Status is read-only, polled from the GPU via the bridge.

interface BoothSettings {
  avatarKelvinVariants: number;
  avatarGroupVariants: number;
  avatarPrompt: string;
  avatarPairPrompt: string;
  avatarGroupPrompt: string;
}

interface GpuStatus {
  ok: boolean;
  parallelSlots: number;
  busyWorkers: number;
  freeSlots: number;
  totalCapacity: number;
  waiting: number;
  etaS: number;
  workers: { instance: string; ready: boolean; busy: boolean; queued: number; free_slots: number }[];
  running: { id: string; endpoint: string; elapsed_s: number; instance: string }[];
  queued: { id: string; endpoint: string; pos: number; eta_s: number; instance: string }[];
}

const STATUS_POLL_MS = 3000;

export default function BoothControl() {
  const [settings, setSettings] = useState<BoothSettings | null>(null);
  const [status, setStatus] = useState<GpuStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const statusTimer = useRef<number | null>(null);

  // Load current settings once.
  useEffect(() => {
    let cancelled = false;
    fetch(`${BASE_PATH}/api/settings`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: BoothSettings) => {
        if (cancelled) return;
        setSettings({
          avatarKelvinVariants: d.avatarKelvinVariants ?? 4,
          avatarGroupVariants: d.avatarGroupVariants ?? 3,
          avatarPrompt: d.avatarPrompt ?? "",
          avatarPairPrompt: d.avatarPairPrompt ?? "",
          avatarGroupPrompt: d.avatarGroupPrompt ?? "",
        });
      })
      .catch(() => !cancelled && setMessage("Could not load settings."));
    return () => {
      cancelled = true;
    };
  }, []);

  // Poll live GPU status.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(`${BASE_PATH}/api/avatar/status`, { cache: "no-store" });
        const d = (await r.json()) as GpuStatus;
        if (!cancelled) setStatus(d?.ok ? d : { ...(d as GpuStatus), ok: false });
      } catch {
        if (!cancelled) setStatus(null);
      }
    };
    load();
    statusTimer.current = window.setInterval(load, STATUS_POLL_MS);
    return () => {
      cancelled = true;
      if (statusTimer.current) window.clearInterval(statusTimer.current);
    };
  }, []);

  const patch = useCallback((p: Partial<BoothSettings>) => {
    setSettings((s) => (s ? { ...s, ...p } : s));
  }, []);

  const save = useCallback(async () => {
    if (!settings || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`${BASE_PATH}/api/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setMessage(d.error ?? "Failed to save.");
      else {
        setMessage("Saved — applies on the next capture.");
        patch({
          avatarKelvinVariants: d.avatarKelvinVariants,
          avatarGroupVariants: d.avatarGroupVariants,
          avatarPrompt: d.avatarPrompt,
          avatarPairPrompt: d.avatarPairPrompt,
          avatarGroupPrompt: d.avatarGroupPrompt,
        });
      }
    } catch {
      setMessage("Network error.");
    } finally {
      setSaving(false);
      window.setTimeout(() => setMessage(null), 3500);
    }
  }, [settings, saving, patch]);

  const stepper = (value: number, min: number, max: number, onChange: (n: number) => void) => (
    <div className="stepper">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="Decrease">
        −
      </button>
      <span className="stepper-value">{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="Increase">
        +
      </button>
    </div>
  );

  const promptField = (
    label: string,
    hint: string,
    key: keyof BoothSettings,
    def: string,
  ) => {
    const value = (settings?.[key] as string) ?? "";
    return (
      <div className="prompt-field">
        <div className="prompt-field-head">
          <label>{label}</label>
          <div className="prompt-field-actions">
            <button type="button" className="linkbtn" onClick={() => patch({ [key]: def } as Partial<BoothSettings>)}>
              Load default
            </button>
            {value && (
              <button type="button" className="linkbtn" onClick={() => patch({ [key]: "" } as Partial<BoothSettings>)}>
                Clear
              </button>
            )}
          </div>
        </div>
        <p className="subtitle prompt-hint">{hint}</p>
        <textarea
          value={value}
          maxLength={PROMPT_MAX}
          rows={5}
          placeholder="Blank = house default"
          onChange={(e) => patch({ [key]: e.target.value } as Partial<BoothSettings>)}
        />
        <div className="prompt-count">
          {value ? `${value.length}/${PROMPT_MAX}` : "Using house default"}
        </div>
      </div>
    );
  };

  return (
    <main className="wrap wrap--wide booth">
      <h1>Booth control</h1>
      <p className="subtitle">Live GPU status, how many poses each capture makes, and the generation prompts.</p>

      <div className="booth-grid">
        <div className="booth-col">
      {/* ---- Live status ---- */}
      <section className="panel booth-section">
        <div className="booth-section-head">
          <h2>Live GPU status</h2>
          <span className={`dot ${status?.ok ? "dot--ok" : "dot--off"}`} aria-hidden />
        </div>

        {!status && <p className="subtitle">Loading…</p>}
        {status && !status.ok && <p className="subtitle">GPU status unavailable right now.</p>}

        {status?.ok && (
          <>
            <div className="stat-row">
              <div className="stat">
                <span className="stat-num">{status.busyWorkers}/{status.parallelSlots}</span>
                <span className="stat-label">workers busy</span>
              </div>
              <div className="stat">
                <span className="stat-num">{status.freeSlots}</span>
                <span className="stat-label">free slots</span>
              </div>
              <div className="stat">
                <span className="stat-num">{status.waiting}</span>
                <span className="stat-label">in queue</span>
              </div>
            </div>

            {status.running.length === 0 && status.queued.length === 0 && (
              <p className="subtitle booth-idle">Idle — no jobs running.</p>
            )}

            {status.running.length > 0 && (
              <div className="joblist">
                <h3>Generating now</h3>
                {status.running.map((j) => (
                  <div key={j.id} className="job job--run">
                    <span className={`jbadge jbadge--${j.endpoint}`}>{j.endpoint}</span>
                    <span>worker {j.instance}</span>
                    <span className="job-time">{Math.round(j.elapsed_s)}s elapsed</span>
                  </div>
                ))}
              </div>
            )}

            {status.queued.length > 0 && (
              <div className="joblist">
                <h3>Waiting</h3>
                {status.queued.map((j) => (
                  <div key={j.id} className="job">
                    <span className={`jbadge jbadge--${j.endpoint}`}>{j.endpoint}</span>
                    <span>#{j.pos}</span>
                    <span className="job-time">~{Math.round(j.eta_s)}s to start</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {/* ---- Variants ---- */}
      <section className="panel booth-section">
        <h2>Variants</h2>
        <p className="subtitle">How many takes each capture generates. More = more choice, but slower.</p>
        {settings && (
          <>
            <div className="control-row">
              <div>
                <strong>Me + Mr Kelvin</strong>
                <p className="subtitle" style={{ margin: "2px 0 0" }}>Poses to choose from (1–4).</p>
              </div>
              {stepper(settings.avatarKelvinVariants, 1, 4, (n) => patch({ avatarKelvinVariants: n }))}
            </div>
            <div className="control-row">
              <div>
                <strong>Group</strong>
                <p className="subtitle" style={{ margin: "2px 0 0" }}>Takes per group photo (1–6).</p>
              </div>
              {stepper(settings.avatarGroupVariants, 1, 6, (n) => patch({ avatarGroupVariants: n }))}
            </div>
          </>
        )}
      </section>

        </div>

        <div className="booth-col">
      {/* ---- Prompt overrides ---- */}
      <section className="panel booth-section">
        <h2>Prompt overrides <span className="tag-adv">Advanced</span></h2>
        <div className="notice notice--warn booth-warn">
          Leave blank to use the tested house prompt. If you edit these, keep the skin-tone,
          slim-body, front-facing and plain-background instructions or quality can regress.
          <code>{"{gesture}"}</code> is replaced with the guest&apos;s detected pose.
        </div>
        {settings && (
          <>
            {promptField(
              "Guest figurine",
              "Stage 1 — converts the guest photo into a figurine (Me + Mr Kelvin mode).",
              "avatarPrompt",
              DEFAULT_PROMPT,
            )}
            {promptField(
              "Guest + Mr Kelvin combine",
              "Stage 2 — poses the guest and Kelvin figurines together.",
              "avatarPairPrompt",
              DEFAULT_PAIR_PROMPT,
            )}
            {promptField(
              "Group figurine (per person)",
              "Converts each person in a group photo into a figurine.",
              "avatarGroupPrompt",
              DEFAULT_GROUP_PROMPT,
            )}
          </>
        )}
      </section>

        </div>
      </div>

      <div className="booth-save">
        <button className="btn btn--lg" onClick={save} disabled={saving || !settings}>
          {saving ? "Saving…" : "Save settings"}
        </button>
        {message && (
          <span className={`notice ${message.includes("error") || message.includes("Failed") || message.includes("Could not") ? "notice--error" : "notice--ok"}`}>
            {message}
          </span>
        )}
      </div>
    </main>
  );
}
