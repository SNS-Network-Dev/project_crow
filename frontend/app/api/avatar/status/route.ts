import { NextResponse } from "next/server";
import { avatarStatus } from "@/lib/baremetal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Live GPU queue summary for the capture booth (operator-gated, under /api/avatar).
// The browser can't reach baremetal directly, so the bridge proxies + trims the
// global /avatar/status view to just what the chip needs. Soft-fails with ok:false
// (HTTP 200) so a status blip never disrupts the booth — the chip just hides.
export async function GET() {
  try {
    const s = await avatarStatus();
    const waiting = s.queued?.length ?? 0;
    const etaS = waiting > 0 ? Math.max(...s.queued.map((q) => q.eta_s ?? 0)) : 0;
    return NextResponse.json({
      ok: true,
      // Summary (booth chip):
      parallelSlots: s.parallel_slots ?? 0,
      busyWorkers: s.busy_workers ?? 0,
      freeSlots: s.total_free_slots ?? 0,
      totalCapacity: s.total_capacity ?? 0,
      waiting,
      etaS,
      // Detail (Booth control queue view):
      workers: s.workers ?? [],
      running: s.running ?? [],
      queued: s.queued ?? [],
    });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
