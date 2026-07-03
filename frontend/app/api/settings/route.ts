import { NextResponse } from "next/server";
import { loadSettings, saveSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const settings = await loadSettings();
    return NextResponse.json(settings);
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

  const patch: Partial<{ earlyCheckinCountdownEnabled: boolean; earlyCheckinTargetIso: string }> = {};
  if (typeof body.earlyCheckinCountdownEnabled === "boolean") {
    patch.earlyCheckinCountdownEnabled = body.earlyCheckinCountdownEnabled;
  }
  if (typeof body.earlyCheckinTargetIso === "string") {
    patch.earlyCheckinTargetIso = body.earlyCheckinTargetIso;
  }

  try {
    const settings = await saveSettings(patch);
    return NextResponse.json(settings);
  } catch {
    return NextResponse.json(
      { error: "Could not save settings." },
      { status: 500 },
    );
  }
}
