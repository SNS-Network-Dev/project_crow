"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { BASE_PATH } from "@/lib/basePath";
import { useAdminHome } from "./useAdminHome";

type NavItem = { href: string; label: string; icon: ReactNode; exact?: boolean };

// The sidebar mirrors aimy_chat's company_admin sidebar: a white→slate gradient
// rail with lucide-style icon nav, a teal-tinted active state, and a sticky
// bottom account trigger that opens an upward dropdown. It lives only on admin
// routes (see AppShell). Guests never see it — they go straight to /register.
// Operator items are gated by the `crow_admin_status` cookie (set by /api/login,
// or by proxy automatically when ADMIN_PASSWORD is unset for dev).

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const ADMIN_ITEMS: NavItem[] = [
  {
    href: "/admin/list",
    label: "List",
    icon: (
      <svg viewBox="0 0 24 24" width="16" height="16" {...stroke}>
        <rect width="7" height="9" x="3" y="3" rx="1" />
        <rect width="7" height="5" x="14" y="3" rx="1" />
        <rect width="7" height="9" x="14" y="12" rx="1" />
        <rect width="7" height="5" x="3" y="16" rx="1" />
      </svg>
    ),
  },
  {
    href: "/admin/checkin",
    label: "Check in",
    icon: (
      <svg viewBox="0 0 24 24" width="16" height="16" {...stroke}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <polyline points="16 11 18 13 22 9" />
      </svg>
    ),
  },
  {
    href: "/admin/avatar",
    label: "Photo booth",
    exact: true,
    icon: (
      <svg viewBox="0 0 24 24" width="16" height="16" {...stroke}>
        <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
        <circle cx="12" cy="13" r="3" />
      </svg>
    ),
  },
  {
    href: "/admin/avatar/gallery",
    label: "Photo gallery",
    icon: (
      <svg viewBox="0 0 24 24" width="16" height="16" {...stroke}>
        <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
        <circle cx="9" cy="9" r="2" />
        <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
      </svg>
    ),
  },
  {
    href: "/admin/settings",
    label: "Settings",
    icon: (
      <svg viewBox="0 0 24 24" width="16" height="16" {...stroke}>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

const STORAGE_KEY = "crow.sidebar.collapsed";
const EVENT = "crow-sidebar";
const ADMIN_COOKIE = "crow_admin_status";

// useSyncExternalStore is the React-recommended way to read a localStorage
// preference: getServerSnapshot returns false so SSR markup matches the first
// client render (no hydration mismatch), then the client re-reads the stored
// value. Avoids calling setState inside an effect.
function subscribe(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function getSnapshot(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function getServerSnapshot(): boolean {
  return false;
}

// Same pattern for the admin-status cookie (client-readable, non-httpOnly).
// getServerSnapshot=false keeps SSR/markup stable; the client re-reads after
// hydration, so admin links appear once the cookie is present.
function adminSubscribe(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  window.addEventListener(EVENT, callback); // re-check after login/logout nav
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(EVENT, callback);
  };
}

function readAdminCookie(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return document.cookie.split("; ").includes(`${ADMIN_COOKIE}=1`);
  } catch {
    return false;
  }
}

function adminSnapshot(): boolean {
  return readAdminCookie();
}

function adminServerSnapshot(): boolean {
  return false;
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const isAdmin = useSyncExternalStore(adminSubscribe, adminSnapshot, adminServerSnapshot);
  const homeHref = useAdminHome();

  const [menuOpen, setMenuOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  // Close the account dropdown on outside click / Escape (mirrors aimy's menu).
  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (e: MouseEvent) => {
      if (!bottomRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const toggle = () => {
    try {
      if (typeof window === "undefined") return;
      const next = !(window.localStorage.getItem(STORAGE_KEY) === "1");
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      window.dispatchEvent(new Event(EVENT));
    } catch {
      /* ignore */
    }
  };

  const logout = async () => {
    setMenuOpen(false);
    try {
      await fetch(`${BASE_PATH}/api/logout`, { method: "POST" });
    } catch {
      /* proceed to home regardless */
    }
    router.push("/");
    router.refresh();
  };

  const isActive = (it: NavItem) =>
    pathname === it.href ||
    (!it.exact && it.href !== "/" && !!pathname?.startsWith(it.href + "/"));

  const renderItem = (it: NavItem) => (
    <Link
      key={it.href}
      href={it.href}
      className={`navItem ${isActive(it) ? "navItem--active" : ""}`}
      title={collapsed ? it.label : undefined}
    >
      <span className="navIcon" aria-hidden>
        {it.icon}
      </span>
      <span className="navLabel sidebar-text">{it.label}</span>
    </Link>
  );

  return (
    <aside className={`sidebar ${collapsed ? "sidebar--collapsed" : ""}`}>
      <div className="sidebarHead">
        <Link href={homeHref} className="sidebarBrand" title="Project Crow">
          <span className="sidebarBrandMark" aria-hidden>
            PC
          </span>
          <span className="sidebarBrandName sidebar-text">Project Crow</span>
        </Link>
        <button
          type="button"
          className="sidebarToggle"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand" : "Collapse"}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" {...stroke}>
            <line x1="3" x2="21" y1="6" y2="6" />
            <line x1="3" x2="21" y1="12" y2="12" />
            <line x1="3" x2="21" y1="18" y2="18" />
          </svg>
        </button>
      </div>

      <nav className="sidebarNav" aria-label="Primary">
        <div className="sidebarNavList">
          {isAdmin && ADMIN_ITEMS.map(renderItem)}
          {isAdmin && (
            <button
              type="button"
              className="navItem navItem--mobileLogout"
              onClick={logout}
              title="Log out"
            >
              <span className="navIcon" aria-hidden>
                <svg viewBox="0 0 24 24" width="16" height="16" {...stroke}>
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" x2="9" y1="12" y2="12" />
                </svg>
              </span>
              <span className="navLabel sidebar-text">Log out</span>
            </button>
          )}
        </div>
      </nav>

      {isAdmin && (
        <div className={`sidebarBottom ${menuOpen ? "sidebarBottom--open" : ""}`} ref={bottomRef}>
          <div className={`sidebarAccountMenu ${menuOpen ? "open" : ""}`} id={menuId} role="menu">
            <div className="sidebarAccountMenuHeader">Operator · Project Crow</div>
            <Link
              href="/register"
              className="accountItem"
              role="menuitem"
              onClick={() => setMenuOpen(false)}
            >
              <span className="navIcon" aria-hidden>
                <svg viewBox="0 0 24 24" width="16" height="16" {...stroke}>
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <line x1="19" x2="19" y1="8" y2="14" />
                  <line x1="22" x2="16" y1="11" y2="11" />
                </svg>
              </span>
              <span className="sidebar-text">Register page</span>
            </Link>
            <button
              type="button"
              className="accountItem accountItem--danger"
              role="menuitem"
              onClick={logout}
            >
              <span className="navIcon" aria-hidden>
                <svg viewBox="0 0 24 24" width="16" height="16" {...stroke}>
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" x2="9" y1="12" y2="12" />
                </svg>
              </span>
              <span className="sidebar-text">Log out</span>
            </button>
          </div>

          <button
            type="button"
            className="sidebarAccountTrigger"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls={menuId}
            onClick={() => setMenuOpen((o) => !o)}
            title={collapsed ? "Account" : undefined}
          >
            <span className="accountAvatar" aria-hidden>
              PC
            </span>
            <span className="accountMeta sidebar-text">
              <span className="accountName">Operator</span>
              <span className="accountSub">Project Crow</span>
            </span>
            <svg className="accountChevron sidebar-text" viewBox="0 0 24 24" width="16" height="16" {...stroke} aria-hidden>
              <path d="m18 15-6-6-6 6" />
            </svg>
          </button>
        </div>
      )}
    </aside>
  );
}