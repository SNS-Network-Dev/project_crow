"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";

// The sidebar (operator nav) appears on the list dashboard, settings page, and
// the photo gallery station — all operator hubs. The full-screen tool surfaces
// (/checkin, /avatar, /kiosk) render bare so the camera/stage can use the whole
// viewport; they're still gated by proxy.ts, just without the rail. Public
// surfaces (/register, /login, /early-checkin, and the / redirect) are also bare.
const ADMIN_PREFIXES = ["/list", "/settings", "/avatar/gallery"];

function isAdminRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return ADMIN_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showSidebar = isAdminRoute(pathname);
  return (
    <div className="appShell">
      {showSidebar && <Sidebar />}
      <main className="appMain">{children}</main>
    </div>
  );
}
