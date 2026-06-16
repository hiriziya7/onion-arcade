import { NextRequest, NextResponse } from "next/server";
import { getRepos } from "@/lib/data/sqlite";
import { getOnionBalance, ensureWelcomeOnions } from "@/lib/onions/ledger";

export async function GET(request: NextRequest) {
  const playerId = request.nextUrl.searchParams.get("playerId");
  if (!playerId) {
    return NextResponse.json({ error: "playerId required" }, { status: 400 });
  }

  const repos = getRepos();
  const player = repos.players.getOrCreatePlayer(playerId);
  ensureWelcomeOnions(playerId);

  return NextResponse.json({
    id: player.id,
    handle: player.handle,
    balance: getOnionBalance(playerId),
  });
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { playerId, handle } = body;

    if (!playerId || !handle || typeof handle !== "string" || !handle.trim()) {
      return NextResponse.json(
        { error: "playerId and handle required" },
        { status: 400 }
      );
    }

    const repos = getRepos();
    repos.players.getOrCreatePlayer(playerId);
    ensureWelcomeOnions(playerId);
    const player = repos.players.setHandle(playerId, handle.trim());

    return NextResponse.json({
      id: player.id,
      handle: player.handle,
      balance: getOnionBalance(playerId),
    });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
