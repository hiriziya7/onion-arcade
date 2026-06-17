import { NextRequest, NextResponse } from "next/server";
import { getRepos } from "@/lib/data/sqlite";
import { checkAdminSecret } from "@/lib/onions/config";

export const dynamic = "force-dynamic";

// POST /api/onions/arcade/leaderboard/flag { playerId, hidden } — flag / unflag
// a PLAYER (anti-spoofing). A flagged player and ALL their scores (existing and
// any future ones) drop from the public board AND the top-3 payout; reversible.
// Admin-gated.
export async function POST(request: NextRequest) {
  if (!checkAdminSecret(request.headers.get("x-admin-secret"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: { playerId?: string; hidden?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { playerId, hidden } = body;
  if (!playerId || typeof hidden !== "boolean") {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  getRepos().players.setFlagged(playerId, hidden);
  return NextResponse.json({ ok: true, playerId, hidden });
}
