"use client";

import { Suspense, useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BASE_PATH } from "@/lib/basePath";

// Operators log in here to reach /checkin, /avatar, /kiosk, /list, /settings.
// The look mirrors aimy_chat's security/login_page.php (gradient + grid
// background, glass card, "Welcome Back!"). Guests never see this — they go to
// /early-checkin. See proxy.ts for the gate and /api/login for the passphrase check.

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  // Only allow internal return paths to avoid open-redirect.
  const rawNext = params.get("next") ?? "";
  const next = rawNext.startsWith("/") ? rawNext : "/list";

  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`${BASE_PATH}/api/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });
        const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !body.ok) {
          setError(body.error ?? "Login failed.");
          setBusy(false);
          return;
        }
        router.push(next);
        router.refresh();
      } catch {
        setError("Network error. Try again.");
        setBusy(false);
      }
    },
    [password, next, router],
  );

  return (
    <form onSubmit={submit} className="loginForm">
      {error && <div className="notice notice--error">{error}</div>}
      <div className="loginField">
        <label htmlFor="password" className="loginLabel">
          Password
        </label>
        <input
          id="password"
          className="loginInput"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          autoComplete="current-password"
          placeholder="Enter admin password"
        />
      </div>
      <button className="loginBtn" type="submit" disabled={busy || !password}>
        {busy ? "Signing in…" : "Sign In"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="loginPage">
      <div className="loginGrid" aria-hidden />
      <div className="loginCard">
        <div className="loginLogo" aria-hidden>
          PC
        </div>
        <h1 className="loginTitle">Welcome Back!</h1>
        <p className="loginSubtitle">Sign in to continue.</p>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
        <p className="loginFoot">Project Crow · operators only</p>
      </div>
    </div>
  );
}