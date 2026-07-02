import { redirect } from "next/navigation";

// Public entry point.Visiting the root always sends guests to /register
// (rendered as .../project_crow/register under the basePath in production).
// Operator tools live at /admin, /checkin, /avatar, /kiosk behind proxy.ts.
export default function RootIndex() {
  redirect("/register");
}