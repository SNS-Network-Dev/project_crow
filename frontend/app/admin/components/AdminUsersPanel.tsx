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

  // change-password state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [changePassword, setChangePassword] = useState("");
  const [changeBusy, setChangeBusy] = useState(false);

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

  const showMessage = useCallback((text: string, isError = false) => {
    setMessage(text);
    window.setTimeout(() => setMessage(null), isError ? 5000 : 3000);
  }, []);

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
        showMessage(body.error ?? "Could not create admin.", true);
      } else {
        setEmail("");
        setPassword("");
        showMessage("Admin created.");
        await load();
      }
    } catch {
      showMessage("Network error.", true);
    } finally {
      setBusy(false);
    }
  }, [busy, email, password, load, showMessage]);

  const remove = useCallback(
    async (id: number) => {
      if (!window.confirm("Delete this admin?")) return;
      try {
        const res = await fetch(`${BASE_PATH}/api/admins/${id}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error();
        showMessage("Admin deleted.");
        await load();
      } catch {
        showMessage("Could not delete admin.", true);
      }
    },
    [load, showMessage],
  );

  const startChange = useCallback((id: number) => {
    setEditingId(id);
    setChangePassword("");
    setMessage(null);
  }, []);

  const cancelChange = useCallback(() => {
    setEditingId(null);
    setChangePassword("");
  }, []);

  const savePassword = useCallback(
    async (id: number) => {
      if (changeBusy) return;
      if (changePassword.length < 6) {
        showMessage("Password must be at least 6 characters.", true);
        return;
      }
      setChangeBusy(true);
      try {
        const res = await fetch(`${BASE_PATH}/api/admins/${id}/password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: changePassword }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          showMessage(body.error ?? "Could not update password.", true);
        } else {
          showMessage("Password updated.");
          setEditingId(null);
          setChangePassword("");
          await load();
        }
      } catch {
        showMessage("Network error.", true);
      } finally {
        setChangeBusy(false);
      }
    },
    [changeBusy, changePassword, load, showMessage],
  );

  if (loading) return <p className="subtitle">Loading admins…</p>;

  const isError =
    message &&
    (message.includes("error") ||
      message.includes("Could not") ||
      message.includes("failed") ||
      message.includes("must be"));

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
              <div className="admin-user-actions">
                <button
                  className="btn btn--sm btn--ghost"
                  onClick={() => startChange(a.id)}
                  disabled={changeBusy}
                >
                  Change password
                </button>
                <button
                  className="btn btn--sm btn--danger"
                  onClick={() => remove(a.id)}
                  disabled={changeBusy}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editingId != null && (
        <div
          className="panel"
          style={{
            marginTop: 16,
            background: "#f8fafc",
            border: "1px dashed #cbd5e1",
          }}
        >
          <div className="register-field" style={{ marginBottom: 14 }}>
            <label htmlFor="change-password">New password</label>
            <input
              id="change-password"
              type="password"
              value={changePassword}
              onChange={(e) => setChangePassword(e.target.value)}
              placeholder="At least 6 characters"
              autoFocus
            />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              className="register-btn register-btn--primary"
              onClick={() => savePassword(editingId)}
              disabled={changeBusy || changePassword.length < 6}
            >
              {changeBusy ? "Saving…" : "Update password"}
            </button>
            <button
              className="register-btn register-btn--ghost"
              onClick={cancelChange}
              disabled={changeBusy}
            >
              Cancel
            </button>
          </div>
        </div>
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
