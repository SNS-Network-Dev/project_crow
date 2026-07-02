"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

const ITEMS = [
  { href: "/checkin", label: "Check in", mono: "CI" },
  { href: "/avatar", label: "Avatar poster", mono: "AP" },
  { href: "/register", label: "Register", mono: "RG" },
  { href: "/admin", label: "Admin", mono: "AD" },
];

const STORAGE_KEY = "crow.sidebar.collapsed";
const EVENT = "crow-sidebar";

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

export default function Sidebar() {
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

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

  const isActive = (href: string) =>
    pathname === href ||
    (href !== "/" && !!pathname?.startsWith(href + "/")) ||
    (href === "/checkin" && pathname === "/kiosk");

  return (
    <aside className={`sidebar ${collapsed ? "sidebar--collapsed" : ""}`}>
      <div className="sidebarHead">
        <Link href="/" className="sidebarBrand" title="Project Crow">
          <span className="sidebarBrandFull">Project Crow</span>
          <span className="sidebarBrandMono" aria-hidden>
            PC
          </span>
        </Link>
        <button
          type="button"
          className="sidebarToggle"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand" : "Collapse"}
        >
          <span className="chevron" data-collapsed={collapsed || undefined} aria-hidden />
        </button>
      </div>

      <nav className="sidebarNav" aria-label="Primary">
        {ITEMS.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className={`navItem ${isActive(it.href) ? "navItem--active" : ""}`}
            title={collapsed ? it.label : undefined}
          >
            <span className="navMono" aria-hidden>
              {it.mono}
            </span>
            <span className="navLabel">{it.label}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}