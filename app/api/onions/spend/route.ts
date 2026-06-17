import { NextRequest, NextResponse } from "next/server";
import { getRepos } from "@/lib/data/sqlite";
import { GAME_COST } from "@/lib/onions/config";
import { ensureWelcomeOnions } from "@/lib/onions/ledger";
import { REASON } from "@/lib/onions/reasons";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { playerId, gameId } = body;

    if (!playerId || !gameId) {
      return NextResponse.json(
        { error: "playerId and gameId required" },
        { status: 400 }
      );
    }

    const repos = getRepos();
    // Make sure the player exists and has their starting onions before we try
    // to charge them. The welcome grant is 100 locally but 0 when OnionDAO is
    // configured (real economy — top up first), per ensureWelcomeOnions.
    repos.players.getOrCreatePlayer(playerId);
    ensureWelcomeOnions(playerId);

    const r = repos.ledger.spend(playerId, GAME_COST, REASON.PLAY_PREFIX + gameId);
    if (!r.ok) {
      return NextResponse.json(
        { error: "insufficient", balance: r.balance },
        { status: 402 }
      );
    }

    return NextResponse.json({ ok: true, balance: r.balance });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
