import { NextRequest, NextResponse } from "next/server";
import { getRepos } from "@/lib/data/sqlite";
import { checkAdminSecret } from "@/lib/onions/config";
import {
  computeArcadeView,
  splitTop3,
  isGameId,
  lowerIsBetter,
} from "@/lib/arcade/pool";

export const dynamic = "force-dynamic";

// GET /api/onions/arcade/preview?game= — read-only preview of paying out a
// game's pool to its top 3 (correct ranking direction per game). No money moves.
export async function GET(request: NextRequest) {
  if (!checkAdminSecret(request.headers.get("x-admin-secret"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const game = request.nextUrl.searchParams.get("game");
  if (!isGameId(game)) {
    return NextResponse.json({ error: "invalid_game" }, { status: 400 });
  }
  const repos = getRepos();
  const view = computeArcadeView(game);
  const top = repos.scores.getTopScores(game, 3, lowerIsBetter(game));
  const { shares, paid, remainder } = splitTop3(view.pool, top);
  return NextResponse.json({ gameId: game, pool: view.pool, shares, paid, remainder });
}
