"use client";

import { useCallback, useEffect, useState } from "react";
import { BASE_PATH } from "@/lib/basePath";

interface Admin {
  id: number;
  email: string;
  created_at: string;
}

export default function AdminUsersPanel() {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_PATH}/api/admins`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      setAdmins(body.admins ?? []);
    } catch {
      setMessage("Could not load admin users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`${BASE_PATH}/api/admins`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(body.error ?? "Could not create admin.");
      } else {
        setEmail("");
        setPassword("");
        setMessage("Admin created.");
        await load();
      }
    } catch {
      setMessage("Network error.");
    } finally {
      setBusy(false);
      window.setTimeout(() => setMessage(null), 3000);
    }
  }, [busy, email, password, load]);

  const remove = useCallback(
    async (id: number) => {
      if (!window.confirm("Delete this admin?")) return;
      try {
        const res = await fetch(`${BASE_PATH}/api/admins/${id}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error();
        setMessage("Admin deleted.");
        await load();
      } catch {
        setMessage("Could not delete admin.");
      } finally {
        window.setTimeout(() => setMessage(null), 3000);
      }
    },
    [load],
  );

  if (loading) return <p className="subtitle">Loading admins…</p>;

  const isError =
    message &&
    (message.includes("error") ||
      message.includes("Could not") ||
      message.includes("failed"));

  return (
    <div className="panel" style={{ maxWidth: 560, marginTop: 20 }}>
      <h2 style={{ marginBottom: 22 }}>Admin users</h2>

      <div className="register-field" style={{ marginBottom: 16 }}>
        <label htmlFor="admin-email">Email</label>
        <input
          id="admin-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="admin@example.com"
        />
      </div>

      <div className="register-field" style={{ marginBottom: 22 }}>
        <label htmlFor="admin-password">Password</label>
        <input
          id="admin-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 6 characters"
        />
      </div>

      <button
        className="register-btn register-btn--primary register-btn--block"
        onClick={create}
        disabled={busy || !email || password.length < 6}
      >
        {busy ? "Creating…" : "Add admin"}
      </button>

      {admins.length > 0 && (
        <ul className="admin-user-list">
          {admins.map((a) => (
            <li key={a.id} className="admin-user-row">
              <span>{a.email}</span>
              <button
                className="btn btn--sm btn--danger"
                onClick={() => remove(a.id)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

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
