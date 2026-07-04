"use client";

import { useCallback, useState } from "react";
import { BASE_PATH } from "@/lib/basePath";
import { useAdminData } from "../components/useAdminData";
import PeopleTable from "../components/PeopleTable";
import PersonDrawer from "../components/PersonDrawer";
import CheckinsTable from "../components/CheckinsTable";
import LiveClock from "../components/LiveClock";
import { useToast } from "../../components/ToastProvider";
import styles from "../components/admin.module.css";

type Tab = "people" | "checkins" | "notCheckedIn";

export default function ListPage() {
  const data = useAdminData();
  const toast = useToast();
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

  const handleManualCheckin = useCallback(
    async (id: number, name: string) => {
      try {
        const res = await fetch(`${BASE_PATH}/api/early-checkin/manual`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ person_id: id }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          alreadyCheckedIn?: boolean;
          error?: string;
        };
        if (!res.ok) {
          toast.show(body.error ?? "Could not check in.", "error");
          return;
        }
        if (body.alreadyCheckedIn) {
          toast.show(`${name} is already checked in.`, "info");
          return;
        }
        toast.show(`${name} checked in.`, "ok");
        await data.refreshAll();
      } catch {
        toast.show("Network error. Try again.", "error");
      }
    },
    [data, toast],
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
          onCheckin={handleManualCheckin}
          checkedInFilter="all"
          prioritizeNotCheckedIn
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
          onCheckin={handleManualCheckin}
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
