import { NextResponse } from "next/server";
import { health, ensureMatrixSynced } from "@/lib/baremetal";
import { countPeople } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Bridge health: confirms DB + baremetal reachability and forces a matrix sync.
export async function GET() {
  let dbPeople: number | null = null;
  let dbError: string | null = null;
  try {
    dbPeople = await countPeople();
  } catch (e) {
    dbError = (e as Error).message;
  }

  try {
    await ensureMatrixSynced(true);
  } catch {
    /* reported via baremetal block below */
  }

  let baremetal = null;
  let baremetalError: string | null = null;
  try {
    baremetal = await health();
  } catch (e) {
    baremetalError = (e as Error).message;
  }

  return NextResponse.json({
    ok: dbError === null && baremetalError === null,
    db: { people: dbPeople, error: dbError },
    baremetal: baremetal ?? { error: baremetalError },
  });
}
