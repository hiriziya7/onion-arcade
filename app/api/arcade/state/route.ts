import { NextRequest, NextResponse } from "next/server";
import { getRepos } from "@/lib/data/sqlite";
import { checkAdminSecret } from "@/lib/onions/config";
import {
  computeDevAndTotals,
  lowerIsBetter,
  GAME_COST,
  RAKE,
  POOL_CAP,
  PAYOUT_CURVE,
} from "@/lib/arcade/pool";

export const dynamic = "force-dynamic";

// GET /api/onions/arcade/state — the dashboard's main read: one section per game
// (pool view + admin leaderboard + last winners + metrics) plus the single
// aggregate dev pot and the config. Admin-gated.
export async function GET(request: NextRequest) {
  if (!checkAdminSecret(request.headers.get("x-admin-secret"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const repos = getRepos();
  const dev = computeDevAndTotals();

  const games = dev.perGame.map((view) => ({
    ...view,
    leaderboard: repos.scores.getAdminLeaderboard(
      view.gameId,
      15,
      lowerIsBetter(view.gameId)
    ),
    winners: repos.arcadePool.latestWinners(view.gameId),
    metrics: {
      totalPlays: repos.ledger.countPlays(view.gameId, null, null),
      uniquePlayers: repos.ledger.uniquePlayersForGame(view.gameId),
    },
  }));

  return NextResponse.json({
    games,
    dev: {
      devEarned: dev.devEarned,
      rakeEarned: dev.rakeEarned,
      overflowEarned: dev.overflowEarned,
      devWithdrawn: dev.devWithdrawn,
      devBalance: dev.devBalance,
    },
    config: {
      gameCost: GAME_COST,
      rake: RAKE,
      poolCap: POOL_CAP,
      payoutCurve: PAYOUT_CURVE,
    },
  });
}
