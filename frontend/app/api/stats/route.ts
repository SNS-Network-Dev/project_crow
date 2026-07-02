import { NextResponse } from "next/server";
import {
  countPeople,
  countCheckins,
  countCheckinsToday,
  distinctCheckedInPersonCount,
} from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin dashboard overview. One round-trip, four cheap count queries.
// With one-check-in-per-person, total check-ins == distinct people checked in,
// so "Checked in" uses distinctCheckedIn and "Not checked in" is registered − that.
export async function GET() {
  const [registered, checkedIn, today, distinctCheckedIn] = await Promise.all([
    countPeople(),
    countCheckins(),
    countCheckinsToday(),
    distinctCheckedInPersonCount(),
  ]);

  return NextResponse.json({
    registered,
    checkedIn,
    today,
    distinctCheckedIn,
    notCheckedIn: Math.max(0, registered - distinctCheckedIn),
  });
}