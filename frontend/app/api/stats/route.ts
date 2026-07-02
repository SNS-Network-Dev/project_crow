import { NextResponse } from "next/server";
import {
  countPeople,
  countCheckins,
  countCheckinsToday,
  distinctCheckedInPersonCount,
  countConsent,
} from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin dashboard overview. One round-trip, five cheap count queries.
export async function GET() {
  const [registered, checkedIn, today, distinctCheckedIn, consentYes] = await Promise.all([
    countPeople(),
    countCheckins(),
    countCheckinsToday(),
    distinctCheckedInPersonCount(),
    countConsent(),
  ]);

  return NextResponse.json({
    registered,
    checkedIn,
    today,
    distinctCheckedIn,
    noShow: Math.max(0, registered - distinctCheckedIn),
    consentYes,
    consentRate: registered > 0 ? consentYes / registered : 0,
  });
}