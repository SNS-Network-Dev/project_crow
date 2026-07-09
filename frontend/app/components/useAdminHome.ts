"use client";

import { useSyncExternalStore } from "react";

const ADMIN_COOKIE = "crow_admin_status";

function subscribe(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return document.cookie.split("; ").includes(`${ADMIN_COOKIE}=1`);
  } catch {
    return false;
  }
}

function getServerSnapshot(): boolean {
  return false;
}

// Returns the page an operator should land on after exiting a tool surface.
// Operators go back to /admin; guests fall through to /, which redirects to
// /checkin.
export function useAdminHome(): string {
  const isAdmin = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return isAdmin ? "/admin" : "/";
}
