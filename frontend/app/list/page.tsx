"use client";

import { useCallback, useState } from "react";
import { useAdminData } from "../admin/components/useAdminData";
import PeopleTable from "../admin/components/PeopleTable";
import PersonDrawer from "../admin/components/PersonDrawer";
import CheckinsTable from "../admin/components/CheckinsTable";
import LiveClock from "../admin/components/LiveClock";
import styles from "../admin/components/admin.module.css";

type Tab = "people" | "checkins" | "notCheckedIn";

export default function ListPage() {
  const data = useAdminData();
  const [tab, setTab] = useState<Tab>("people");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const selectedPerson =
    selectedId != null
      ? (data.people.find((p) => p.id === selectedId) ?? null)
      : null;

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

  const notCheckedInCount =
    data.stats?.notCheckedIn ??
    data.people.filter((p) => !data.checkins.some((c) => c.person_id === p.id))
      .length;

  return (
    <main className="wrap wrap--wide">
      <div className={styles.pageHeader}>
        <div>
          <h1>List</h1>
          <p className="subtitle">People directory and recent check-ins.</p>
        </div>
        <LiveClock />
      </div>

      {data.error && <div className="notice notice--error">{data.error}</div>}

      <div className="tab-bar">
        <button
          className={tab === "people" ? "tab tab--active" : "tab"}
          onClick={() => setTab("people")}
        >
          Registered ({data.people.length})
        </button>
        <button
          className={tab === "checkins" ? "tab tab--active" : "tab"}
          onClick={() => setTab("checkins")}
        >
          Checked in ({data.checkins.length})
        </button>
        <button
          className={tab === "notCheckedIn" ? "tab tab--active" : "tab"}
          onClick={() => setTab("notCheckedIn")}
        >
          Not checked in ({notCheckedInCount})
        </button>
        <input
          className="tabSearch"
          type="text"
          placeholder={
            tab === "checkins"
              ? "Search by name, company, designation…"
              : "Search name, email, company…"
          }
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
          checkedInFilter="all"
        />
      )}

      {tab === "checkins" && (
        <CheckinsTable
          people={data.people}
          checkins={data.checkins}
          search={search}
          onDeleteCheckin={data.deleteCheckinById}
        />
      )}

      {tab === "notCheckedIn" && (
        <PeopleTable
          people={data.people}
          checkins={data.checkins}
          search={search}
          onSelect={openDrawer}
          checkedInFilter="notCheckedIn"
        />
      )}

      <PersonDrawer
        person={selectedPerson}
        onPatch={data.patchPerson}
        onDelete={handleDelete}
        onClose={closeDrawer}
      />
    </main>
  );
}
