import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getRepos } from "@/lib/data/sqlite";
import { checkAdminSecret, isOnionConfigured } from "@/lib/onions/config";
import { OnionApiError, transfer } from "@/lib/onions/onionApi";
import {
  computeArcadeView,
  splitTop3,
  isGameId,
  lowerIsBetter,
} from "@/lib/arcade/pool";

export const dynamic = "force-dynamic";

const DEFINITIVE_REJECT = new Set([400, 404, 409, 422]);

// POST /api/onions/arcade/payout?game= — pay ONE game's pool to its top 3
// (50/30/20, leftover to #1) via real escrow->winner transfers, then drain the
// paid amount from THAT game's pool. Uses the game's real ranking direction so
// lower-is-better games (seven, lights-out) pay the BEST (lowest) scores. Local
// mode records without a real transfer.
export async function POST(request: NextRequest) {
  if (!checkAdminSecret(request.headers.get("x-admin-secret"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const game = request.nextUrl.searchParams.get("game");
  if (!isGameId(game)) {
    return NextResponse.json({ error: "invalid_game" }, { status: 400 });
  }

  const repos = getRepos();
  const view = computeArcadeView(game);
  if (view.pool <= 0) {
    return NextResponse.json({ error: "empty_pool" }, { status: 400 });
  }

  const top = repos.scores.getTopScores(game, 3, lowerIsBetter(game));
  const { shares } = splitTop3(view.pool, top);
  if (shares.length === 0) {
    return NextResponse.json({ error: "no_players" }, { status: 400 });
  }

  const configured = isOnionConfigured();
  const payoutId = randomUUID();
  const settled: Array<{ rank: number; handle: string | null; amount: number }> = [];
  const results: Array<{ rank: number; handle: string | null; amount: number; status: string }> = [];
  let actuallyPaid = 0;

  for (const s of shares) {
    if (configured) {
      if (!s.handle) {
        results.push({ ...s, status: "no_username" });
        continue;
      }
      try {
        await transfer(
          s.handle,
          s.amount,
          "arcadepay_" + payoutId + "_" + s.rank,
          "Arcade prize payout"
        );
      } catch (e) {
        results.push({
          ...s,
          status:
            e instanceof OnionApiError && DEFINITIVE_REJECT.has(e.status)
              ? "rejected"
              : "transfer_failed",
        });
        continue;
      }
    }
    actuallyPaid += s.amount;
    settled.push({ rank: s.rank, handle: s.handle, amount: s.amount });
    results.push({ ...s, status: configured ? "paid" : "recorded" });
  }

  if (settled.length > 0) {
    repos.arcadePool.recordPayout(payoutId, settled, actuallyPaid, view.totalSpent, game);
  }

  return NextResponse.json({
    gameId: game,
    payoutId,
    configured,
    paid: actuallyPaid,
    results,
    view: computeArcadeView(game),
  });
}
