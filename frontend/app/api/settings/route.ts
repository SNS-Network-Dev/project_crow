import { NextResponse } from "next/server";
import {
  earlyCheckinTargetIso,
  loadSettings,
  saveSettings,
  type AppSettings,
} from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toResponse(settings: AppSettings) {
  return NextResponse.json({
    ...settings,
    earlyCheckinTargetIso: earlyCheckinTargetIso(settings),
  });
}

export async function GET() {
  try {
    const settings = await loadSettings();
    return toResponse(settings);
  } catch {
    return NextResponse.json(
      { error: "Could not load settings." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad JSON." }, { status: 400 });
  }

  const patch: Partial<AppSettings> = {};
  if (typeof body.eventName === "string") {
    patch.eventName = body.eventName.trim();
  }
  if (typeof body.eventStartIso === "string") {
    patch.eventStartIso = body.eventStartIso;
  }
  if (typeof body.earlyCheckinCountdownEnabled === "boolean") {
    patch.earlyCheckinCountdownEnabled = body.earlyCheckinCountdownEnabled;
  }

  try {
    const settings = await saveSettings(patch);
    return toResponse(settings);
  } catch {
    return NextResponse.json(
      { error: "Could not save settings." },
      { status: 500 },
    );
  }
}
