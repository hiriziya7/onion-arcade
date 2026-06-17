import { NextRequest, NextResponse } from "next/server";
import { getRepos } from "@/lib/data/sqlite";
import { ensureWelcomeOnions } from "@/lib/onions/ledger";
import { getGameMeta } from "@/lib/games/registry-data";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const gameId = searchParams.get("gameId");
  const playerId = searchParams.get("playerId");
  const personalBest = searchParams.get("personalBest");

  if (!gameId) {
    return NextResponse.json({ error: "gameId required" }, { status: 400 });
  }

  const meta = getGameMeta(gameId);
  if (!meta) {
    return NextResponse.json({ error: "Unknown game" }, { status: 404 });
  }

  const repos = getRepos();

  if (personalBest === "1" && playerId) {
    const best = repos.scores.getPersonalBest(
      gameId,
      playerId,
      meta.lowerIsBetter
    );
    return NextResponse.json({ personalBest: best });
  }

  const limit = Math.min(
    parseInt(searchParams.get("limit") ?? "10", 10) || 10,
    100
  );
  const entries = repos.scores.getTopScores(
    gameId,
    limit,
    meta.lowerIsBetter
  );
  return NextResponse.json({ entries });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { gameId, playerId, value, meta } = body;

    if (!gameId || !playerId || typeof value !== "number") {
      return NextResponse.json(
        { error: "gameId, playerId, and value required" },
        { status: 400 }
      );
    }

    const gameMeta = getGameMeta(gameId);
    if (!gameMeta) {
      return NextResponse.json({ error: "Unknown game" }, { status: 404 });
    }

    const repos = getRepos();
    repos.players.getOrCreatePlayer(playerId);
    ensureWelcomeOnions(playerId);

    const score = repos.scores.addScore(gameId, playerId, value, meta);
    const personalBest = repos.scores.getPersonalBest(
      gameId,
      playerId,
      gameMeta.lowerIsBetter
    );

    const updatedPlayer = repos.players.getPlayer(playerId);

    return NextResponse.json({
      score,
      personalBest,
      handle: updatedPlayer?.handle ?? null,
    });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
