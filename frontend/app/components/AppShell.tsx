"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";

// The sidebar (operator nav) appears on the admin hub (/admin/list,
// /admin/settings) and the photo gallery (/admin/avatar/gallery). Admin
// full-screen tools (/admin/checkin, /admin/avatar, /kiosk) render bare so the
// camera/stage can use the whole viewport; they're still gated by proxy.ts,
// just without the rail. Public surfaces (/register, /login, /early-checkin,
// and the / redirect) are also bare.
const SIDEBAR_ADMIN_PREFIXES = ["/admin/list", "/admin/settings", "/admin/avatar/gallery"];

function isAdminRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return SIDEBAR_ADMIN_PREFIXES.some(
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
