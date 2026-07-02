import { NextResponse } from "next/server";
import { recentCheckins } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 50);
  const rows = await recentCheckins(limit);
  return NextResponse.json({
    checkins: rows.map((r) => ({
      id: r.id,
      person_id: r.person_id,
      name: r.name,
      score: r.score,
      checked_in_at: r.checked_in_at,
    })),
  });
}
