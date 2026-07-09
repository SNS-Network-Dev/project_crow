import QrCheckinKiosk from "../../components/QrCheckinKiosk";

// Full-screen QR check-in surface: a USB QR scanner (keyboard-wedge) reads the
// guest's invitation QR and records the check-in. Renders bare (no sidebar),
// same as /admin/checkin — see AppShell's SIDEBAR_ADMIN_PREFIXES.
export default function QrCheckinPage() {
  return <QrCheckinKiosk />;
}
