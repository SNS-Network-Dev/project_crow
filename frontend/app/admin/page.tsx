"use client";

import { useCallback, useState } from "react";
import { useAdminData } from "./components/useAdminData";
import PeopleTable from "./components/PeopleTable";
import PersonDrawer from "./components/PersonDrawer";
import CheckinsTable from "./components/CheckinsTable";

type Tab = "people" | "checkins";

export default function AdminPage() {
  const data = useAdminData();
  const [tab, setTab] = useState<Tab>("people");
  const [search, setSearch] = useState("");
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

      <div className="tab-bar">
        <button className={tab === "people" ? "tab tab--active" : "tab"} onClick={() => setTab("people")}>
          Registered ({data.people.length})
        </button>
        <button className={tab === "checkins" ? "tab tab--active" : "tab"} onClick={() => setTab("checkins")}>
          Checked in ({data.checkins.length})
        </button>
        <input
          className="tabSearch"
          type="text"
          placeholder={tab === "people" ? "Search name, email, company…" : "Search by name…"}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search"
        />
      </div>

      {tab === "people" && (
        <PeopleTable
          people={data.people}
          checkins={data.checkins}
          search={search}
          onSelect={openDrawer}
        />
      )}

      {tab === "checkins" && <CheckinsTable checkins={data.checkins} search={search} />}

      <PersonDrawer
        person={selectedPerson}
        onPatch={data.patchPerson}
        onDelete={handleDelete}
        onClose={closeDrawer}
      />
    </main>
  );
}