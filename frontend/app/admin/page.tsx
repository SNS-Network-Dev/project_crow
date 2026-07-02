"use client";

import { useCallback, useState } from "react";
import { useAdminData } from "./components/useAdminData";
import StatsBar from "./components/StatsBar";
import PeopleTable from "./components/PeopleTable";
import PersonDrawer from "./components/PersonDrawer";
import CheckinsTable from "./components/CheckinsTable";

type Tab = "people" | "checkins";

export default function AdminPage() {
  const data = useAdminData();
  const [tab, setTab] = useState<Tab>("people");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const selectedPerson = selectedId != null ? data.people.find((p) => p.id === selectedId) ?? null : null;

  const openDrawer = useCallback((id: number) => setSelectedId(id), []);
  const closeDrawer = useCallback(() => setSelectedId(null), []);

  const handleDelete = useCallback(
    async (id: number) => {
      const ok = await data.deletePersonById(id);
      if (ok) closeDrawer();
      return ok;
    },
    [data, closeDrawer],
  );

  return (
    <main className="wrap wrap--wide">
      <h1>Admin</h1>
      <p className="subtitle">People directory and recent check-ins.</p>

      {data.error && <div className="notice notice--error">{data.error}</div>}

      <StatsBar stats={data.stats} loading={data.loading} />

      <div className="tab-bar">
        <button className={tab === "people" ? "tab tab--active" : "tab"} onClick={() => setTab("people")}>
          People ({data.people.length})
        </button>
        <button className={tab === "checkins" ? "tab tab--active" : "tab"} onClick={() => setTab("checkins")}>
          Check-ins ({data.checkins.length})
        </button>
      </div>

      {tab === "people" && (
        <PeopleTable people={data.people} checkins={data.checkins} onSelect={openDrawer} />
      )}

      {tab === "checkins" && <CheckinsTable checkins={data.checkins} />}

      <PersonDrawer
        person={selectedPerson}
        onPatch={data.patchPerson}
        onDelete={handleDelete}
        onClose={closeDrawer}
      />
    </main>
  );
}