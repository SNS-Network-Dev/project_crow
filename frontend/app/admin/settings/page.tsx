import AdminUsersPanel from "../components/AdminUsersPanel";
import SettingsPanel from "../components/SettingsPanel";

export default function SettingsPage() {
  return (
    <main className="wrap wrap--wide">
      <h1 style={{ marginBottom: 6 }}>Settings</h1>
      <p className="subtitle" style={{ marginBottom: 24 }}>
        Manage event details, self check-in, and admin users.
      </p>
      <div className="admin-cols">
        <SettingsPanel />
        <AdminUsersPanel />
      </div>
    </main>
  );
}
