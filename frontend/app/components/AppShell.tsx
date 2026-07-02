"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";

// The sidebar (operator nav) only appears on the admin dashboard — it's the hub
// operators navigate from. The full-screen tool surfaces (/checkin, /avatar,
// /kiosk) render bare so the camera/stage can use the whole viewport; they're
// still gated by proxy.ts, just without the rail. Public surfaces (/register,
// /login, and the / -> /register redirect) are also bare.
const ADMIN_PREFIXES = ["/admin"];

function isAdminRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return ADMIN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
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