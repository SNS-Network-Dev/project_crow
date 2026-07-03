import { redirect } from "next/navigation";

// Public entry point. Visiting the root sends guests to /early-checkin
// (rendered as .../project_crow/early-checkin under the basePath in production).
// Operator tools live at /admin/* and /kiosk behind proxy.ts.
// /register remains directly available for late face registrations.
export default function RootIndex() {
  redirect("/early-checkin");
}