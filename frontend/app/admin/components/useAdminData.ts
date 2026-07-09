"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BASE_PATH } from "@/lib/basePath";

// Shared admin types (mirrors the API shapes; see app/api/people, /api/checkins, /api/stats).

export interface Person {
  id: number;
  name: string;
  email: string | null;
  contact_number: string | null;
  company_email: string | null;
  full_company_name: string | null;
  designation: string | null;
  invited_by: string | null;
  remarks: string | null;
  photo_url: string | null;
  qr_code_path: string | null;
  consent_at: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface Checkin {
  id: number;
  person_id: number;
  name: string;
  score: number;
  method: string | null; // 'face' | 'manual' | 'qr'; null for legacy rows
  checked_in_at: string;
}

export interface Stats {
  registered: number;
  checkedIn: number;
  today: number;
  distinctCheckedIn: number;
  notCheckedIn: number;
}

export interface PersonPatch {
  name?: string | null;
  email?: string | null;
  contactNumber?: string | null;
  companyEmail?: string | null;
  fullCompanyName?: string | null;
  designation?: string | null;
  invitedBy?: string | null;
  remarks?: string | null;
}

interface AdminData {
  people: Person[];
  checkins: Checkin[];
  stats: Stats | null;
  loading: boolean;
  error: string | null;
  refreshAll: () => Promise<void>;
  refreshCheckins: () => Promise<void>;
  refreshStats: () => Promise<void>;
  patchPerson: (id: number, patch: PersonPatch) => Promise<boolean>;
  deletePersonById: (id: number) => Promise<boolean>;
  deleteCheckinById: (id: number) => Promise<boolean>;
}

const POLL_MS = 10_000;

// Module-scope fetcher so effect deps stay stable. Raw fetch does NOT auto-prefix
// basePath, so we prefix with BASE_PATH here.
async function getJson<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`${BASE_PATH}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

export function useAdminData(): AdminData {
  const [people, setPeople] = useState<Person[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const inFlight = useRef<Set<"all" | "checkins" | "stats">>(new Set());

  const refreshStats = useCallback(async () => {
    if (inFlight.current.has("stats")) return;
    inFlight.current.add("stats");
    try {
      const s = await getJson<Stats>("/api/stats");
      setStats(s);
    } catch {
      /* keep last stats; surface only on full load failure */
    } finally {
      inFlight.current.delete("stats");
    }
  }, []);

  const refreshPeople = useCallback(async () => {
    const p = await getJson<{ people: Person[] }>("/api/people");
    setPeople(p.people ?? []);
  }, []);

  const refreshCheckins = useCallback(async () => {
    if (inFlight.current.has("checkins")) return;
    inFlight.current.add("checkins");
    try {
      const c = await getJson<{ checkins: Checkin[] }>(
        "/api/checkins?limit=50",
      );
      setCheckins(c.checkins ?? []);
    } catch {
      /* keep last */
    } finally {
      inFlight.current.delete("checkins");
    }
  }, []);

  const refreshAll = useCallback(async () => {
    if (inFlight.current.has("all")) return;
    inFlight.current.add("all");
    try {
      const [s, p, c] = await Promise.all([
        getJson<Stats>("/api/stats"),
        getJson<{ people: Person[] }>("/api/people"),
        getJson<{ checkins: Checkin[] }>("/api/checkins?limit=50"),
      ]);
      setStats(s);
      setPeople(p.people ?? []);
      setCheckins(c.checkins ?? []);
      setError(null);
    } catch {
      setError("Could not load admin data.");
    } finally {
      setLoading(false);
      inFlight.current.delete("all");
    }
  }, []);

  // Initial load. Inlined with .then/.catch so setState only runs in async
  // callbacks (calling a traced user function like refreshAll directly in the
  // effect body trips react-hooks/set-state-in-effect).
  useEffect(() => {
    let cancelled = false;
    inFlight.current.add("all");
    Promise.all([
      getJson<Stats>("/api/stats"),
      getJson<{ people: Person[] }>("/api/people"),
      getJson<{ checkins: Checkin[] }>("/api/checkins?limit=50"),
    ])
      .then(([s, p, c]) => {
        if (cancelled) return;
        setStats(s);
        setPeople(p.people ?? []);
        setCheckins(c.checkins ?? []);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load admin data.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
        inFlight.current.delete("all");
      });
    return () => {
      cancelled = true;
      inFlight.current.delete("all");
    };
  }, []);

  // Refresh everything when another part of the app (e.g. the sidebar Excel
  // import) broadcasts that the people/check-in data changed.
  useEffect(() => {
    const onRefresh = () => {
      refreshAll();
    };
    window.addEventListener("crow-data-refresh", onRefresh);
    return () => window.removeEventListener("crow-data-refresh", onRefresh);
  }, [refreshAll]);

  // Poll check-ins + stats while the tab is visible. Pauses when hidden so a
  // background tab doesn't stack requests.
  useEffect(() => {
    const tick = () => {
      if (document.hidden) return;
      refreshCheckins();
      refreshStats();
    };
    const id = window.setInterval(tick, POLL_MS);
    return () => window.clearInterval(id);
  }, [refreshCheckins, refreshStats]);

  const patchPerson = useCallback(
    async (id: number, patch: PersonPatch): Promise<boolean> => {
      try {
        const res = await fetch(`${BASE_PATH}/api/people/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) return false;
        // Refresh people (for updated_at) + stats (check-in counts could change).
        await Promise.all([refreshPeople(), refreshStats()]);
        return true;
      } catch {
        return false;
      }
    },
    [refreshPeople, refreshStats],
  );

  const deletePersonById = useCallback(
    async (id: number): Promise<boolean> => {
      try {
        const res = await fetch(`${BASE_PATH}/api/people/${id}`, {
          method: "DELETE",
        });
        if (!res.ok) return false;
        await refreshAll();
        return true;
      } catch {
        return false;
      }
    },
    [refreshAll],
  );

  const deleteCheckinById = useCallback(
    async (id: number): Promise<boolean> => {
      try {
        const res = await fetch(`${BASE_PATH}/api/checkins/${id}`, {
          method: "DELETE",
        });
        if (!res.ok) return false;
        await refreshAll();
        return true;
      } catch {
        return false;
      }
    },
    [refreshAll],
  );

  return {
    people,
    checkins,
    stats,
    loading,
    error,
    refreshAll,
    refreshCheckins,
    refreshStats,
    patchPerson,
    deletePersonById,
    deleteCheckinById,
  };
}
